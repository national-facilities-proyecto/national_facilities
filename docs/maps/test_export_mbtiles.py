import gzip
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from export_mbtiles import export, tile_range


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "pilot.mbtiles"
        self.output = self.root / "xyz"
        self.bbox = [-77.02, -12.18, -77.01, -12.17]
        self.payload = bytes([26, 9, 10, 5, 119, 97, 116, 101, 114, 120, 2])
        with closing(sqlite3.connect(self.source)) as db, db:
            db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
            db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
            layers = ["water", "waterway", "landcover", "landuse", "park", "transportation"]
            db.executemany("INSERT INTO metadata VALUES (?, ?)", [
                ("format", "pbf"), ("minzoom", "0"), ("maxzoom", "14"),
                ("bounds", "-78,-13,-76,-11"),
                ("json", json.dumps({"vector_layers": [{"id": layer} for layer in layers]})),
            ])
            xs, ys = tile_range(self.bbox, 14)
            self.x, self.y = xs.start, ys.start
            db.execute("INSERT INTO tiles VALUES (14, ?, ?, ?)",
                       (self.x, (1 << 14) - 1 - self.y, gzip.compress(self.payload)))

    def test_converts_tms_to_xyz_and_preserves_gzip(self):
        manifest = export(self.source, self.output, self.bbox)
        data = (self.output / "14" / str(self.x) / f"{self.y}.pbf").read_bytes()
        self.assertEqual(gzip.decompress(data), self.payload)
        self.assertEqual(manifest["scheme"], "xyz")
        self.assertEqual(manifest["emptyTiles"], manifest["tiles"] - 1)
        self.assertEqual(gzip.decompress((self.output / "0/0/0.pbf").read_bytes()), b"")

    def test_writes_deterministic_releases(self):
        first = export(self.source, self.output, self.bbox)
        second = export(self.source, self.root / "xyz2", self.bbox)
        self.assertEqual(first["sha256"], second["sha256"])

    def test_refuses_existing_output(self):
        self.output.mkdir()
        with self.assertRaisesRegex(ValueError, "already exists"):
            export(self.source, self.output, self.bbox)

    def test_limits_tile_count_before_writing(self):
        with self.assertRaisesRegex(ValueError, "exceed"):
            export(self.source, self.output, self.bbox, max_tiles=1)
        self.assertFalse(self.output.exists())

    def test_rejects_incompatible_format_zoom_schema_or_bounds(self):
        for field, value in [("format", "png"), ("maxzoom", "13"), ("json", "{}"), ("bounds", "0,0,1,1")]:
            with self.subTest(field=field), closing(sqlite3.connect(self.source)) as db, db:
                old = db.execute("SELECT value FROM metadata WHERE name=?", (field,)).fetchone()[0]
                db.execute("UPDATE metadata SET value=? WHERE name=?", (value, field))
                db.commit()
                with self.assertRaises(ValueError):
                    export(self.source, self.output, self.bbox)
                db.execute("UPDATE metadata SET value=? WHERE name=?", (old, field))

    def test_rejects_invalid_bbox(self):
        with self.assertRaisesRegex(ValueError, "bbox"):
            export(self.source, self.output, [-77, 90, -76, 91])


if __name__ == "__main__":
    unittest.main()
