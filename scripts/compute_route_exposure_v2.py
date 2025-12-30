#!/usr/bin/env python3
"""
Route Exposure V2 - Shelter Signature Algorithm
================================================

This replaces the v1 fetch-based approach with a corrected geometry-first
model that computes shelter signatures based on land proximity.

Key differences from v1:
- Uses 10m resolution land data (not 50m) for better coastal accuracy
- 50 sample points per route (not 10)
- Shelter detection at 3km threshold (not just fetch distance)
- Outputs shelter_ratio (0=fully sheltered, 1=fully open) per direction
- Includes validation assertions to catch geometric errors

Algorithm:
1. For each route, sample 50 points along the route line
2. For each of 16 wind-from directions:
   - Cast 30km ray upwind from each sample point
   - Measure distance to first land intersection
   - Point is "sheltered" if intersection <= 3km
3. shelter_ratio[d] = (points NOT sheltered) / total_points
   - 1.0 = fully open (all rays go 30km without hitting land)
   - 0.0 = fully sheltered (all rays hit land within 3km)
4. effective_open_fetch_km[d] = median of intersection distances (capped at 30km)

Validation:
- Route distances must match expected haversine distances
- HY-NAN must have mean shelter_ratio > WH-VH by at least 0.2

Dependencies:
    pip install geopandas shapely pyproj numpy

Coastline Data:
    Download Natural Earth 10m Land:
    https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/physical/ne_10m_land.zip

    Extract to: scripts/data/ne_10m_land/

Usage:
    python scripts/compute_route_exposure_v2.py
"""

import json
import math
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional

import numpy as np

try:
    import geopandas as gpd
    from shapely.geometry import Point, LineString
    from shapely.ops import unary_union
    from pyproj import Transformer
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install geopandas shapely pyproj numpy")
    sys.exit(1)


# ============================================================================
# CONFIGURATION
# ============================================================================

# Port coordinates (from Supabase seed data)
PORTS = {
    'woods-hole': {'lat': 41.5234, 'lon': -70.6693, 'name': 'Woods Hole'},
    'hyannis': {'lat': 41.6362, 'lon': -70.2826, 'name': 'Hyannis'},
    'vineyard-haven': {'lat': 41.4535, 'lon': -70.6036, 'name': 'Vineyard Haven'},
    'oak-bluffs': {'lat': 41.4571, 'lon': -70.5566, 'name': 'Oak Bluffs'},
    'nantucket': {'lat': 41.2835, 'lon': -70.0995, 'name': 'Nantucket'},
}

# Routes to compute
ROUTES = [
    {'route_id': 'wh-vh-ssa', 'origin': 'woods-hole', 'dest': 'vineyard-haven'},
    {'route_id': 'vh-wh-ssa', 'origin': 'vineyard-haven', 'dest': 'woods-hole'},
    {'route_id': 'wh-ob-ssa', 'origin': 'woods-hole', 'dest': 'oak-bluffs'},
    {'route_id': 'ob-wh-ssa', 'origin': 'oak-bluffs', 'dest': 'woods-hole'},
    {'route_id': 'hy-nan-ssa', 'origin': 'hyannis', 'dest': 'nantucket'},
    {'route_id': 'nan-hy-ssa', 'origin': 'nantucket', 'dest': 'hyannis'},
    {'route_id': 'hy-nan-hlc', 'origin': 'hyannis', 'dest': 'nantucket'},
    {'route_id': 'nan-hy-hlc', 'origin': 'nantucket', 'dest': 'hyannis'},
    {'route_id': 'hy-vh-hlc', 'origin': 'hyannis', 'dest': 'vineyard-haven'},
    {'route_id': 'vh-hy-hlc', 'origin': 'vineyard-haven', 'dest': 'hyannis'},
]

# 16-point compass directions (wind FROM direction, in degrees)
COMPASS_DIRECTIONS = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
    'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
}

# V2 Algorithm Parameters
SAMPLE_POINTS_PER_ROUTE = 50  # Increased from 10
MAX_RAY_KM = 30.0  # Maximum ray distance
SHELTER_THRESHOLD_KM = 3.0  # Point is sheltered if land within this distance
RAY_STEP_M = 50  # Step size for ray casting (smaller = more accurate)

# File paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
OUTPUT_FILE = os.path.join(SCRIPT_DIR, '..', 'src', 'lib', 'config', 'route_exposure_v2.json')

# Expected route distances for validation (km, approximate)
EXPECTED_DISTANCES = {
    ('woods-hole', 'vineyard-haven'): {'min': 8, 'max': 12, 'expected': 10},
    ('woods-hole', 'oak-bluffs'): {'min': 8, 'max': 14, 'expected': 11},
    ('hyannis', 'nantucket'): {'min': 40, 'max': 48, 'expected': 44},
    ('hyannis', 'vineyard-haven'): {'min': 35, 'max': 45, 'expected': 40},
}


# ============================================================================
# COORDINATE TRANSFORMATIONS
# ============================================================================

# WGS84 to UTM Zone 19N (appropriate for Cape Cod area)
transformer_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32619", always_xy=True)
transformer_to_wgs = Transformer.from_crs("EPSG:32619", "EPSG:4326", always_xy=True)


def wgs84_to_utm(lon: float, lat: float) -> Tuple[float, float]:
    """Convert WGS84 to UTM Zone 19N (meters)."""
    return transformer_to_utm.transform(lon, lat)


def utm_to_wgs84(x: float, y: float) -> Tuple[float, float]:
    """Convert UTM Zone 19N to WGS84."""
    return transformer_to_wgs.transform(x, y)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate haversine distance in km between two points."""
    R = 6371  # Earth radius in km

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = math.sin(delta_lat / 2) ** 2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


# ============================================================================
# LAND MASK LOADING
# ============================================================================

def load_land_mask() -> gpd.GeoDataFrame:
    """
    Load Natural Earth land polygons.

    Priority:
    1. 10m resolution (most accurate for coastal areas)
    2. 50m resolution (fallback)
    3. 110m resolution (last resort)
    """
    paths_to_try = [
        os.path.join(DATA_DIR, 'ne_10m_land', 'ne_10m_land.shp'),
        os.path.join(DATA_DIR, 'ne_50m_land', 'ne_50m_land.shp'),
        os.path.join(DATA_DIR, 'ne_110m_land', 'ne_110m_land.shp'),
    ]

    for path in paths_to_try:
        if os.path.exists(path):
            print(f"Loading land mask from: {path}")
            gdf = gpd.read_file(path)

            # Convert to UTM for distance calculations
            gdf_utm = gdf.to_crs("EPSG:32619")

            # Create unified geometry for faster intersection
            land_union = unary_union(gdf_utm.geometry)

            print(f"  Loaded {len(gdf)} land polygons")
            return gpd.GeoDataFrame(geometry=[land_union], crs="EPSG:32619")

    raise FileNotFoundError(
        f"Could not find land mask. Please download Natural Earth 10m land shapefile:\n"
        f"  https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/physical/ne_10m_land.zip\n"
        f"Extract to: {DATA_DIR}/ne_10m_land/"
    )


# ============================================================================
# SHELTER COMPUTATION
# ============================================================================

def cast_ray_to_land(
    point_utm: Tuple[float, float],
    wind_from_degrees: float,
    land_geom,
    max_distance_m: float = MAX_RAY_KM * 1000
) -> float:
    """
    Cast a ray upwind from a point and find distance to first land intersection.

    Args:
        point_utm: (x, y) in UTM meters
        wind_from_degrees: Direction wind is coming FROM (0 = N, 90 = E, etc.)
        land_geom: Shapely geometry of land
        max_distance_m: Maximum distance to check

    Returns:
        Distance to first land intersection in km, or max_distance_m/1000 if no hit
    """
    x, y = point_utm

    # Wind is coming FROM this direction, so upwind is the same direction
    angle_rad = math.radians(wind_from_degrees)

    # Direction components
    dx = math.sin(angle_rad)  # East component
    dy = math.cos(angle_rad)  # North component

    # Cast ray in steps
    step_m = RAY_STEP_M
    for dist in np.arange(step_m, max_distance_m + step_m, step_m):
        test_x = x + dx * dist
        test_y = y + dy * dist
        test_point = Point(test_x, test_y)

        if land_geom.contains(test_point):
            return dist / 1000.0  # Return km

    return max_distance_m / 1000.0  # No land hit


def sample_route_points(origin: dict, dest: dict, n_points: int) -> List[Tuple[float, float]]:
    """
    Sample N points evenly along the route line.

    Args:
        origin: {'lat': float, 'lon': float}
        dest: {'lat': float, 'lon': float}
        n_points: Number of points to sample

    Returns:
        List of (x, y) tuples in UTM coordinates
    """
    x1, y1 = wgs84_to_utm(origin['lon'], origin['lat'])
    x2, y2 = wgs84_to_utm(dest['lon'], dest['lat'])

    points = []
    for i in range(n_points):
        # Evenly distribute, slightly offset from endpoints
        t = (i + 0.5) / n_points
        x = x1 + t * (x2 - x1)
        y = y1 + t * (y2 - y1)
        points.append((x, y))

    return points


def compute_shelter_signature(
    route_id: str,
    origin_slug: str,
    dest_slug: str,
    land_geom
) -> Dict:
    """
    Compute shelter signature for a route across all 16 wind directions.

    Returns:
        {
            'route_id': str,
            'origin_port': str,
            'destination_port': str,
            'shelter_ratio_by_dir': {direction: 0..1},  # 1=open, 0=sheltered
            'effective_open_fetch_km_by_dir': {direction: float},
            'mean_shelter_ratio': float,
            'top_exposure_dirs': [list of top 3 directions],
        }
    """
    origin = PORTS[origin_slug]
    dest = PORTS[dest_slug]

    # Sample points along route
    sample_points = sample_route_points(origin, dest, SAMPLE_POINTS_PER_ROUTE)

    shelter_ratio_by_dir = {}
    effective_fetch_by_dir = {}

    for dir_name, degrees in COMPASS_DIRECTIONS.items():
        intersection_distances = []
        sheltered_flags = []

        for point in sample_points:
            dist_km = cast_ray_to_land(point, degrees, land_geom)
            intersection_distances.append(dist_km)

            # Point is sheltered if land is within threshold
            is_sheltered = dist_km <= SHELTER_THRESHOLD_KM
            sheltered_flags.append(is_sheltered)

        # shelter_ratio = fraction of points NOT sheltered (i.e., open)
        # 1.0 = all points open, 0.0 = all points sheltered
        shelter_ratio = 1.0 - (sum(sheltered_flags) / len(sheltered_flags))
        shelter_ratio_by_dir[dir_name] = round(shelter_ratio, 3)

        # Effective open fetch = median of intersection distances (capped)
        capped_distances = [min(d, MAX_RAY_KM) for d in intersection_distances]
        effective_fetch = float(np.median(capped_distances))
        effective_fetch_by_dir[dir_name] = round(effective_fetch, 2)

    # Compute mean shelter ratio across all directions
    mean_shelter_ratio = float(np.mean(list(shelter_ratio_by_dir.values())))

    # Find top 3 exposure directions (highest shelter_ratio = most exposed)
    sorted_dirs = sorted(shelter_ratio_by_dir.items(), key=lambda x: x[1], reverse=True)
    top_dirs = [d[0] for d in sorted_dirs[:3]]

    return {
        'route_id': route_id,
        'origin_port': origin_slug,
        'destination_port': dest_slug,
        'shelter_ratio_by_dir': shelter_ratio_by_dir,
        'effective_open_fetch_km_by_dir': effective_fetch_by_dir,
        'mean_shelter_ratio': round(mean_shelter_ratio, 3),
        'top_exposure_dirs': top_dirs,
    }


# ============================================================================
# VALIDATION
# ============================================================================

def validate_route_distances() -> bool:
    """Validate that route distances match expected haversine distances."""
    print("\n" + "=" * 60)
    print("VALIDATION: Route Distances (Haversine)")
    print("=" * 60)

    all_pass = True

    for (origin, dest), expected in EXPECTED_DISTANCES.items():
        p1 = PORTS[origin]
        p2 = PORTS[dest]
        dist = haversine_km(p1['lat'], p1['lon'], p2['lat'], p2['lon'])

        status = "PASS" if expected['min'] <= dist <= expected['max'] else "FAIL"
        if status == "FAIL":
            all_pass = False

        print(f"  {origin} → {dest}: {dist:.1f} km (expected ~{expected['expected']} km) [{status}]")

    return all_pass


def validate_exposure_ordering(results: List[Dict]) -> bool:
    """
    Validate that exposure ordering makes geographic sense.

    Key check: Hyannis-Nantucket must have higher mean shelter_ratio
    than Woods Hole-Vineyard Haven by at least 0.2
    """
    print("\n" + "=" * 60)
    print("VALIDATION: Exposure Ordering")
    print("=" * 60)

    # Find mean shelter ratios for key routes
    hy_nan = next((r for r in results if r['route_id'] == 'hy-nan-ssa'), None)
    wh_vh = next((r for r in results if r['route_id'] == 'wh-vh-ssa'), None)

    if not hy_nan or not wh_vh:
        print("  ERROR: Could not find required routes")
        return False

    hy_nan_ratio = hy_nan['mean_shelter_ratio']
    wh_vh_ratio = wh_vh['mean_shelter_ratio']
    diff = hy_nan_ratio - wh_vh_ratio

    print(f"\n  Mean Shelter Ratios (higher = more exposed):")
    print(f"    Hyannis → Nantucket:       {hy_nan_ratio:.3f}")
    print(f"    Woods Hole → Vineyard Haven: {wh_vh_ratio:.3f}")
    print(f"    Difference:                 {diff:+.3f}")

    # HY-NAN must be MORE exposed (higher ratio) than WH-VH by at least 0.2
    check = diff >= 0.2
    print(f"\n  Check: HY-NAN > WH-VH by >= 0.2: {'PASS' if check else 'FAIL'}")

    if not check:
        print("\n  DIAGNOSTIC: This suggests the land mask may not have sufficient")
        print("  resolution for Cape Cod islands, or the computation has an error.")
        print("  Expected: Nantucket Sound crossing is ~44km over open water.")
        print("  Expected: Vineyard Sound crossing is ~10km with partial shelter.")

    return check


def print_exposure_tables(results: List[Dict]):
    """Print detailed exposure tables for key routes."""
    print("\n" + "=" * 60)
    print("EXPOSURE TABLES (shelter_ratio by direction)")
    print("=" * 60)
    print("shelter_ratio: 1.0 = fully open, 0.0 = fully sheltered")

    for route_id in ['wh-vh-ssa', 'hy-nan-ssa', 'hy-vh-hlc']:
        result = next((r for r in results if r['route_id'] == route_id), None)
        if result:
            print(f"\n{route_id} (mean: {result['mean_shelter_ratio']:.3f}):")
            print(f"  Top 3 exposure: {', '.join(result['top_exposure_dirs'])}")

            # Print in two rows of 8
            dirs = list(COMPASS_DIRECTIONS.keys())
            for row_start in [0, 8]:
                row_dirs = dirs[row_start:row_start + 8]
                values = [f"{d}:{result['shelter_ratio_by_dir'][d]:.2f}" for d in row_dirs]
                print(f"  {' '.join(values)}")


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("Route Exposure V2 - Shelter Signature Algorithm")
    print("=" * 60)

    # Validate route distances first
    if not validate_route_distances():
        print("\nERROR: Route distance validation failed!")
        sys.exit(1)

    # Load land mask
    try:
        land_gdf = load_land_mask()
        land_geom = land_gdf.geometry.iloc[0]
    except FileNotFoundError as e:
        print(f"\nERROR: {e}")
        sys.exit(1)

    # Compute shelter signature for each route
    print(f"\nComputing shelter signatures for {len(ROUTES)} routes...")
    print(f"  Parameters: {SAMPLE_POINTS_PER_ROUTE} samples, {MAX_RAY_KM}km rays, {SHELTER_THRESHOLD_KM}km shelter threshold")
    results = []

    for route in ROUTES:
        print(f"  {route['route_id']}...", end=" ", flush=True)
        signature = compute_shelter_signature(
            route['route_id'],
            route['origin'],
            route['dest'],
            land_geom
        )
        results.append(signature)
        print(f"mean_ratio={signature['mean_shelter_ratio']:.3f}")

    # Print detailed tables
    print_exposure_tables(results)

    # Validate exposure ordering
    if not validate_exposure_ordering(results):
        print("\nERROR: Exposure ordering validation failed!")
        print("The computed exposure does not match expected geographic reality.")
        sys.exit(1)

    # Save output
    output = {
        'version': '2.0',
        'algorithm': 'shelter_signature',
        'computed_at': datetime.now(timezone.utc).isoformat(),
        'parameters': {
            'sample_points': SAMPLE_POINTS_PER_ROUTE,
            'max_ray_km': MAX_RAY_KM,
            'shelter_threshold_km': SHELTER_THRESHOLD_KM,
            'ray_step_m': RAY_STEP_M,
            'compass_buckets': 16,
        },
        'routes': {r['route_id']: r for r in results},
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Output written to: {OUTPUT_FILE}")
    print("\n✓ All validations passed!")
    print("Done!")


if __name__ == '__main__':
    main()
