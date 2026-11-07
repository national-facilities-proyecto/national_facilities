"""Export a bounded, previously generated MVT MBTiles release to gzipped XYZ.

Standard library only. Does not download data, contact AWS or overwrite releases.
MBTiles tile_row is TMS (south origin); output y is XYZ (north origin).
"""

import argparse
from contextlib import closing
import gzip
import hashlib
import json
import math
from pathlib import Path
import sqlite3


def tile_range(bbox, zoom):
    west, south, east, north = bbox
    scale = 2**zoom

    def x(lon):
        return max(0, min(scale - 1, math.floor((lon + 180) / 360 * scale)))

    def y(lat):
        projected = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2
        return max(0, min(scale - 1, math.floor(projected * scale)))

    return range(x(west), x(east) + 1), range(y(north), y(south) + 1)


def export(source, destination, bbox, max_tiles=20000):
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
        raise ValueError("Invalid non-antimeridian Mercator bbox")
    source = Path(source).resolve(strict=True)
    destination = Path(destination).resolve()
    if destination.exists():
        raise ValueError("Output already exists; use a new release directory")
    count = sum(
        len(xs) * len(ys)
        for xs, ys in (tile_range(bbox, zoom) for zoom in range(15))
    )
    if count > max_tiles:
        raise ValueError(f"{count} tiles exceed --max-tiles={max_tiles}")
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as database:
        metadata = dict(database.execute("SELECT name, value FROM metadata"))
        if metadata.get("format") != "pbf":
            raise ValueError("Expected MVT/PBF MBTiles, not raster or OSM source PBF")
        if int(metadata.get("minzoom", "0")) > 0 or int(metadata.get("maxzoom", "-1")) < 14:
            raise ValueError("Source must cover native zooms 0 through 14")
        declared = {
            layer["id"]
            for layer in json.loads(metadata.get("json", "{}")).get("vector_layers", [])
        }
        required = {"water", "waterway", "landcover", "landuse", "park", "transportation"}
        if not required.issubset(declared):
            raise ValueError(f"Source metadata lacks styled layers: {sorted(required - declared)}")
        if "bounds" not in metadata:
            raise ValueError("Source must declare bounds to verify pilot coverage")
        sw, ss, se, sn = map(float, metadata["bounds"].split(","))
        if not (sw <= west and ss <= south and se >= east and sn >= north):
            raise ValueError("Pilot bbox exceeds source bounds")
        destination.mkdir(parents=True)
        empty_count = 0
        sizes = 0
        digest = hashlib.sha256()
        for zoom in range(15):
            xs, ys = tile_range(bbox, zoom)
            for x in xs:
                directory = destination / str(zoom) / str(x)
                directory.mkdir(parents=True, exist_ok=True)
                for y in ys:
                    row = database.execute(
                        "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
                        (zoom, x, (1 << zoom) - 1 - y),
                    ).fetchone()
                    # Sparse generators omit featureless tiles. Publish explicit, valid
                    # empty MVT only INSIDE the declared pilot, never mask HTTP failures.
                    raw = bytes(row[0]) if row else b""
                    if raw.startswith(b"\x1f\x8b"):
                        raw = gzip.decompress(raw)
                    if not raw:
                        empty_count += 1
                    payload = gzip.compress(raw, mtime=0)
                    target = directory / f"{y}.pbf"
                    target.write_bytes(payload)
                    sizes += len(payload)
                    digest.update(f"{zoom}/{x}/{y}.pbf\n".encode())
                    digest.update(payload)
        manifest = {
            "format": "pbf",
            "scheme": "xyz",
            "contentEncoding": "gzip",
            "minzoom": 0,
            "maxzoom": 14,
            "bounds": bbox,
            "tiles": count,
            "emptyTiles": empty_count,
            "compressedBytes": sizes,
            "sha256": digest.hexdigest(),
            "sourceMetadata": metadata,
        }
        (destination / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--bbox", nargs=4, type=float, required=True, metavar=("W", "S", "E", "N"))
    parser.add_argument("--max-tiles", type=int, default=20000)
    args = parser.parse_args()
    print(json.dumps(export(args.source, args.destination, args.bbox, args.max_tiles), indent=2))
