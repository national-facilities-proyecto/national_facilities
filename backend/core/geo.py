from math import radians, sin, cos, sqrt, atan2


def distancia_metros(lat1, lon1, lat2, lon2):
    """Distancia entre dos coordenadas usando la formula de Haversine, en metros."""
    radio_tierra = 6371000
    phi1, phi2 = radians(float(lat1)), radians(float(lat2))
    d_phi = radians(float(lat2) - float(lat1))
    d_lambda = radians(float(lon2) - float(lon1))
    a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return radio_tierra * 2 * atan2(sqrt(a), sqrt(1 - a))