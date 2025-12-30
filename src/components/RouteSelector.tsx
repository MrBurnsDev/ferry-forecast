'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchRegions,
  fetchRoutesFull,
  type DbRegion,
  type RouteFull,
} from '@/lib/supabase/queries';
import {
  getRegions,
  getPortsByRegion,
  getAvailableDestinations,
  getOperatorsForRoute,
  getRoutesByDestination,
  getOperatorDisplayName,
} from '@/lib/config/routes';

interface RouteSelectorProps {
  initialRegion?: string;
  initialOrigin?: string;
  initialDestination?: string;
  initialOperator?: string;
}

interface PortOption {
  slug: string;
  name: string;
}

interface OperatorOption {
  slug: string;
  name: string;
}

export function RouteSelector({
  initialRegion,
  initialOrigin,
  initialDestination,
  initialOperator,
}: RouteSelectorProps) {
  const router = useRouter();

  // Data state
  const [regions, setRegions] = useState<{ slug: string; name: string }[]>([]);
  const [allRoutes, setAllRoutes] = useState<RouteFull[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selectedRegion, setSelectedRegion] = useState<string>(initialRegion || '');
  const [selectedOrigin, setSelectedOrigin] = useState<string>(initialOrigin || '');
  const [selectedDestination, setSelectedDestination] = useState<string>(initialDestination || '');
  const [selectedOperator, setSelectedOperator] = useState<string>(initialOperator || '');

  // Derived options
  const [ports, setPorts] = useState<PortOption[]>([]);
  const [destinations, setDestinations] = useState<PortOption[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);

  // Load data from Supabase on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // Try to load from Supabase
      const [regionsResult, routesResult] = await Promise.all([
        fetchRegions(),
        fetchRoutesFull(),
      ]);

      if (
        regionsResult.data &&
        routesResult.data &&
        regionsResult.data.length > 0 &&
        routesResult.data.length > 0
      ) {
        // Use Supabase data
        setRegions(
          regionsResult.data.map((r: DbRegion) => ({
            slug: r.slug,
            name: r.name,
          }))
        );
        setAllRoutes(routesResult.data);
        setUsingFallback(false);

        // Auto-select region if only one
        if (regionsResult.data.length === 1 && !initialRegion) {
          setSelectedRegion(regionsResult.data[0].slug);
        }
      } else {
        // Fall back to static config
        console.warn('Using fallback route config:', regionsResult.error || routesResult.error);
        const fallbackRegions = getRegions();
        setRegions(
          fallbackRegions.map((r) => ({
            slug: r.id,
            name: r.display_name,
          }))
        );
        setAllRoutes([]);
        setUsingFallback(true);

        if (fallbackRegions.length === 1 && !initialRegion) {
          setSelectedRegion(fallbackRegions[0].id);
        }
      }

      setLoading(false);
    }

    loadData();
  }, [initialRegion]);

  // Update ports when region changes
  useEffect(() => {
    if (!selectedRegion) {
      setPorts([]);
      return;
    }

    if (usingFallback) {
      // Use static config
      const regionPorts = getPortsByRegion(selectedRegion);
      setPorts(
        regionPorts.map((p) => ({
          slug: p.id,
          name: p.display_name,
        }))
      );
    } else {
      // Derive from Supabase routes
      const regionRoutes = allRoutes.filter((r) => r.region_slug === selectedRegion);
      const uniquePorts = new Map<string, string>();

      for (const route of regionRoutes) {
        uniquePorts.set(route.origin_port_slug, route.origin_port_name);
        uniquePorts.set(route.destination_port_slug, route.destination_port_name);
      }

      const portList = Array.from(uniquePorts.entries()).map(([slug, name]) => ({
        slug,
        name,
      }));

      // Sort alphabetically
      portList.sort((a, b) => a.name.localeCompare(b.name));
      setPorts(portList);
    }

    // Reset downstream if not initial load
    if (!initialOrigin) {
      setSelectedOrigin('');
      setSelectedDestination('');
      setSelectedOperator('');
    }
  }, [selectedRegion, allRoutes, usingFallback, initialOrigin]);

  // Update destinations when origin changes
  useEffect(() => {
    if (!selectedOrigin) {
      setDestinations([]);
      return;
    }

    if (usingFallback) {
      const availableDestinations = getAvailableDestinations(selectedOrigin);
      setDestinations(
        availableDestinations.map((p) => ({
          slug: p.id,
          name: p.display_name,
        }))
      );
    } else {
      const originRoutes = allRoutes.filter(
        (r) => r.origin_port_slug === selectedOrigin && r.region_slug === selectedRegion
      );
      const uniqueDestinations = new Map<string, string>();

      for (const route of originRoutes) {
        uniqueDestinations.set(route.destination_port_slug, route.destination_port_name);
      }

      const destList = Array.from(uniqueDestinations.entries()).map(([slug, name]) => ({
        slug,
        name,
      }));

      destList.sort((a, b) => a.name.localeCompare(b.name));
      setDestinations(destList);
    }

    if (!initialDestination) {
      setSelectedDestination('');
      setSelectedOperator('');
    }
  }, [selectedOrigin, selectedRegion, allRoutes, usingFallback, initialDestination]);

  // Update operators when destination changes
  useEffect(() => {
    if (!selectedOrigin || !selectedDestination) {
      setOperators([]);
      return;
    }

    if (usingFallback) {
      const availableOperators = getOperatorsForRoute(selectedOrigin, selectedDestination);
      setOperators(
        availableOperators.map((slug) => ({
          slug,
          name: getOperatorDisplayName(slug),
        }))
      );

      if (availableOperators.length === 1 && !initialOperator) {
        setSelectedOperator(availableOperators[0]);
      }
    } else {
      const matchingRoutes = allRoutes.filter(
        (r) =>
          r.origin_port_slug === selectedOrigin &&
          r.destination_port_slug === selectedDestination
      );

      const uniqueOperators = new Map<string, string>();
      for (const route of matchingRoutes) {
        uniqueOperators.set(route.operator_slug, route.operator_name);
      }

      const opList = Array.from(uniqueOperators.entries()).map(([slug, name]) => ({
        slug,
        name,
      }));

      opList.sort((a, b) => a.name.localeCompare(b.name));
      setOperators(opList);

      if (opList.length === 1 && !initialOperator) {
        setSelectedOperator(opList[0].slug);
      }
    }
  }, [selectedOrigin, selectedDestination, allRoutes, usingFallback, initialOperator]);

  // Navigate to route when fully selected
  const handleNavigate = useCallback(() => {
    if (!selectedOrigin || !selectedDestination || !selectedOperator) return;

    let routeSlug: string | undefined;

    if (usingFallback) {
      const routes = getRoutesByDestination(selectedOrigin, selectedDestination);
      const route = routes.find((r) => r.operator === selectedOperator);
      routeSlug = route?.route_id;
    } else {
      const route = allRoutes.find(
        (r) =>
          r.origin_port_slug === selectedOrigin &&
          r.destination_port_slug === selectedDestination &&
          r.operator_slug === selectedOperator
      );
      routeSlug = route?.route_slug;
    }

    if (routeSlug) {
      router.push(`/routes/${routeSlug}`);
    }
  }, [selectedOrigin, selectedDestination, selectedOperator, allRoutes, usingFallback, router]);

  const isComplete =
    selectedRegion && selectedOrigin && selectedDestination && selectedOperator;

  if (loading) {
    return (
      <div className="card-maritime p-6 lg:p-8">
        <h2 className="text-xl font-semibold text-foreground mb-6">Select Your Route</h2>
        <div className="space-y-4">
          <div className="h-12 bg-secondary rounded-lg animate-pulse" />
          <div className="h-12 bg-secondary rounded-lg animate-pulse" />
          <div className="h-12 bg-secondary rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="card-maritime p-6 lg:p-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">Select Your Route</h2>

      {/* Fallback indicator */}
      {usingFallback && (
        <div className="mb-4 px-3 py-2 bg-warning-muted border border-warning/30 rounded-lg text-xs text-warning-foreground">
          Using fallback route config
        </div>
      )}

      <div className="space-y-5">
        {/* Region Selector - Hidden if only one */}
        {regions.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Region
            </label>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="w-full border border-border rounded-lg px-4 py-3 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all"
            >
              <option value="">Select a region</option>
              {regions.map((region) => (
                <option key={region.slug} value={region.slug}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Origin Port */}
        <div>
          <label
            htmlFor="origin-port"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Departing From
          </label>
          <select
            id="origin-port"
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-3 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-all disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
            disabled={!selectedRegion}
            aria-describedby={!selectedRegion ? 'origin-hint' : undefined}
          >
            <option value="">Select departure port</option>
            {ports.map((port) => (
              <option key={port.slug} value={port.slug}>
                {port.name}
              </option>
            ))}
          </select>
          {!selectedRegion && (
            <p id="origin-hint" className="sr-only">Select a region first to enable this field</p>
          )}
        </div>

        {/* Destination Port */}
        <div>
          <label
            htmlFor="destination-port"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Arriving At
          </label>
          <select
            id="destination-port"
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-3 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-all disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
            disabled={!selectedOrigin}
            aria-describedby={!selectedOrigin ? 'destination-hint' : undefined}
          >
            <option value="">Select destination port</option>
            {destinations.map((port) => (
              <option key={port.slug} value={port.slug}>
                {port.name}
              </option>
            ))}
          </select>
          {!selectedOrigin && (
            <p id="destination-hint" className="sr-only">Select a departure port first to enable this field</p>
          )}
        </div>

        {/* Operator - Hidden if only one */}
        {operators.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Ferry Operator
            </label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="w-full border border-border rounded-lg px-4 py-3 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all"
            >
              <option value="">Select operator</option>
              {operators.map((op) => (
                <option key={op.slug} value={op.slug}>
                  {op.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleNavigate}
          disabled={!isComplete}
          aria-disabled={!isComplete}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
            isComplete
              ? 'bg-primary text-primary-foreground hover:bg-navy-light shadow-soft hover:shadow-card'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          View Forecast
        </button>
      </div>
    </div>
  );
}
