[out:json][timeout:40];
(
  relation["boundary"="administrative"]["admin_level"="8"]["name"~"^(Miraflores|Santiago de Surco|San Borja|Barranco|Chorrillos|Surquillo|San Juan de Miraflores)$"](-12.30,-77.15,-12.0,-76.85);
  way["highway"~"^(motorway|trunk|primary)$"](-12.27,-77.11,-12.04,-76.90);
);
out geom;
