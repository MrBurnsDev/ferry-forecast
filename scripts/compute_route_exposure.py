#!/usr/bin/env python3
"""
Route Exposure Computation Script
==================================

Computes per-route exposure to wind from each of 16 compass directions
using coastline land shelter analysis.

Algorithm:
1. For each route, sample N points along the route line
2. For each of 16 wind-from directions:
   - Cast rays upwind from each sample point
   - Measure fetch distance (km) until land intersects
   - Take median of fetch distances
3. Normalize into exposure score 0..1 using log scale

Output:
- route_exposure.json (committed to repo)
- Console validation report

Dependencies:
    pip install geopandas shapely pyproj numpy

Coastline Data:
    Download Natural Earth 110m Land shapefile:
    https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/110m/physical/ne_110m_land.zip

    Or 50m for better accuracy near coasts:
    https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/50m/physical/ne_50m_land.zip

    Extract to: scripts/data/ne_110m_land/ or scripts/data/ne_50m_land/

Usage:
    python scripts/compute_route_exposure.py
"""

import json
import math
import os
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
    exit(1)


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

# Routes to compute (from config)
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

# Computation parameters
SAMPLE_POINTS_PER_ROUTE = 10  # Number of points along route to sample
MAX_FETCH_KM = 50.0  # Maximum fetch distance to check
RAY_STEP_M = 100  # Step size for ray casting (meters)

# File paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
OUTPUT_FILE = os.path.join(SCRIPT_DIR, '..', 'src', 'lib', 'config', 'route_exposure.json')


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


# ============================================================================
# LAND MASK LOADING
# ============================================================================

def load_land_mask() -> gpd.GeoDataFrame:
    """
    Load Natural Earth land polygons and prepare for intersection tests.

    Tries to load from:
    1. scripts/data/ne_50m_land/
    2. scripts/data/ne_110m_land/
    """
    # Try 50m resolution first (more accurate for coastal areas)
    paths_to_try = [
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
        f"Could not find land mask. Please download Natural Earth land shapefile:\n"
        f"  https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/50m/physical/ne_50m_land.zip\n"
        f"Extract to: {DATA_DIR}/ne_50m_land/"
    )


# ============================================================================
# FETCH DISTANCE COMPUTATION
# ============================================================================

def compute_fetch_distance(
    point_utm: Tuple[float, float],
    wind_from_degrees: float,
    land_geom,
    max_distance_m: float = MAX_FETCH_KM * 1000
) -> float:
    """
    Compute fetch distance (distance to land) in a given upwind direction.

    Args:
        point_utm: (x, y) in UTM meters
        wind_from_degrees: Direction wind is coming FROM (0 = N, 90 = E, etc.)
        land_geom: Shapely geometry of land
        max_distance_m: Maximum distance to check

    Returns:
        Distance to land in km, or max_distance_m/1000 if no land hit
    """
    x, y = point_utm

    # Wind is coming FROM this direction, so upwind is the same direction
    # (we're looking in the direction the wind is coming from)
    angle_rad = math.radians(wind_from_degrees)

    # Direction to cast ray (upwind = where wind is coming from)
    # In UTM, Y increases northward, X increases eastward
    # 0 degrees = North = +Y, 90 degrees = East = +X
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
    Sample N points along the route line, evenly spaced.

    Args:
        origin: {'lat': float, 'lon': float}
        dest: {'lat': float, 'lon': float}
        n_points: Number of points to sample

    Returns:
        List of (x, y) tuples in UTM coordinates
    """
    # Convert to UTM
    x1, y1 = wgs84_to_utm(origin['lon'], origin['lat'])
    x2, y2 = wgs84_to_utm(dest['lon'], dest['lat'])

    # Sample points along line
    points = []
    for i in range(n_points):
        t = (i + 0.5) / n_points  # Offset by 0.5 to avoid endpoints exactly
        x = x1 + t * (x2 - x1)
        y = y1 + t * (y2 - y1)
        points.append((x, y))

    return points


# ============================================================================
# EXPOSURE COMPUTATION
# ============================================================================

def compute_route_exposure(
    route_id: str,
    origin_slug: str,
    dest_slug: str,
    land_geom
) -> Dict:
    """
    Compute exposure scores for a route across all 16 wind directions.

    Returns:
        {
            'route_id': str,
            'exposure_by_dir': {direction: 0..1},
            'fetch_km_by_dir': {direction: float},
            'avg_exposure': float,
            'top_exposure_dirs': [list of top 3 directions],
        }
    """
    origin = PORTS[origin_slug]
    dest = PORTS[dest_slug]

    # Sample points along route
    sample_points = sample_route_points(origin, dest, SAMPLE_POINTS_PER_ROUTE)

    fetch_km_by_dir = {}
    exposure_by_dir = {}

    for dir_name, degrees in COMPASS_DIRECTIONS.items():
        # Compute fetch distance for each sample point
        fetch_distances = []
        for point in sample_points:
            fetch_km = compute_fetch_distance(point, degrees, land_geom)
            fetch_distances.append(fetch_km)

        # Use median to be robust to outliers
        median_fetch = float(np.median(fetch_distances))
        fetch_km_by_dir[dir_name] = round(median_fetch, 2)

        # Normalize to 0..1 using log scale
        # exposure = log(fetch + 1) / log(max_fetch + 1)
        exposure = math.log(median_fetch + 1) / math.log(MAX_FETCH_KM + 1)
        exposure = max(0.0, min(1.0, exposure))
        exposure_by_dir[dir_name] = round(exposure, 3)

    # Compute average exposure
    avg_exposure = float(np.mean(list(exposure_by_dir.values())))

    # Find top 3 exposure directions
    sorted_dirs = sorted(exposure_by_dir.items(), key=lambda x: x[1], reverse=True)
    top_dirs = [d[0] for d in sorted_dirs[:3]]

    return {
        'route_id': route_id,
        'origin_port': origin_slug,
        'destination_port': dest_slug,
        'exposure_by_dir': exposure_by_dir,
        'fetch_km_by_dir': fetch_km_by_dir,
        'avg_exposure': round(avg_exposure, 3),
        'top_exposure_dirs': top_dirs,
    }


# ============================================================================
# VALIDATION
# ============================================================================

def validate_results(results: List[Dict]) -> bool:
    """
    Validate that computed exposure makes geographic sense.

    Key checks:
    - Hyannis-Nantucket should have higher exposure than Woods Hole-Vineyard Haven
    - Open water routes to the south should have higher S/SW exposure
    """
    print("\n" + "=" * 60)
    print("VALIDATION REPORT")
    print("=" * 60)

    # Group by unique route (ignoring operator)
    route_exposures = {}
    for r in results:
        key = (r['origin_port'], r['destination_port'])
        route_exposures[key] = r['avg_exposure']

    # Check: Hyannis-Nantucket should have higher exposure than Woods Hole-Vineyard Haven
    hy_nan = route_exposures.get(('hyannis', 'nantucket'), 0)
    wh_vh = route_exposures.get(('woods-hole', 'vineyard-haven'), 0)

    print(f"\nExposure Comparison:")
    print(f"  Hyannis → Nantucket:       {hy_nan:.3f}")
    print(f"  Woods Hole → Vineyard Haven: {wh_vh:.3f}")

    check1 = hy_nan > wh_vh
    print(f"  ✓ HY-NAN > WH-VH: {'PASS' if check1 else 'FAIL'}")

    # Check: Nantucket route should have higher southern exposure
    hy_nan_result = next((r for r in results if r['route_id'] == 'hy-nan-ssa'), None)
    wh_vh_result = next((r for r in results if r['route_id'] == 'wh-vh-ssa'), None)

    if hy_nan_result and wh_vh_result:
        hy_nan_s = hy_nan_result['exposure_by_dir'].get('S', 0)
        wh_vh_s = wh_vh_result['exposure_by_dir'].get('S', 0)
        print(f"\nSoutherly Exposure:")
        print(f"  Hyannis → Nantucket (S):       {hy_nan_s:.3f}")
        print(f"  Woods Hole → Vineyard Haven (S): {wh_vh_s:.3f}")

    # Print exposure tables for key routes
    print("\n" + "-" * 60)
    print("EXPOSURE TABLES (by direction)")
    print("-" * 60)

    for route_id in ['wh-vh-ssa', 'hy-nan-ssa', 'hy-vh-hlc']:
        result = next((r for r in results if r['route_id'] == route_id), None)
        if result:
            print(f"\n{route_id} (avg: {result['avg_exposure']:.3f}):")
            print(f"  Top 3: {', '.join(result['top_exposure_dirs'])}")
            dirs = list(COMPASS_DIRECTIONS.keys())
            # Print in two rows of 8
            for row_start in [0, 8]:
                row_dirs = dirs[row_start:row_start + 8]
                values = [f"{d}:{result['exposure_by_dir'][d]:.2f}" for d in row_dirs]
                print(f"  {' '.join(values)}")

    print("\n" + "=" * 60)

    return check1


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("Route Exposure Computation")
    print("=" * 60)

    # Load land mask
    try:
        land_gdf = load_land_mask()
        land_geom = land_gdf.geometry.iloc[0]
    except FileNotFoundError as e:
        print(f"\nERROR: {e}")
        return

    # Compute exposure for each route
    print(f"\nComputing exposure for {len(ROUTES)} routes...")
    results = []

    for route in ROUTES:
        print(f"  {route['route_id']}...", end=" ", flush=True)
        exposure = compute_route_exposure(
            route['route_id'],
            route['origin'],
            route['dest'],
            land_geom
        )
        results.append(exposure)
        print(f"avg={exposure['avg_exposure']:.3f}")

    # Validate results
    validate_results(results)

    # Save output
    output = {
        'version': '1.0',
        'computed_at': datetime.now(timezone.utc).isoformat(),
        'parameters': {
            'sample_points': SAMPLE_POINTS_PER_ROUTE,
            'max_fetch_km': MAX_FETCH_KM,
            'ray_step_m': RAY_STEP_M,
        },
        'routes': {r['route_id']: r for r in results},
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nOutput written to: {OUTPUT_FILE}")
    print("Done!")


if __name__ == '__main__':
    main()
