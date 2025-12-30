import { RouteSelector } from '@/components/RouteSelector';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy text-white py-8">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Will the ferry run today?
          </h1>
          <p className="text-ocean-light text-lg">
            Predict ferry delays and cancellations before they happen
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Route Selector */}
        <div className="mb-8">
          <RouteSelector />
        </div>

        {/* Info Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="text-2xl mb-2">🌊</div>
              <h3 className="font-medium mb-1">Real-Time Weather</h3>
              <p className="text-sm text-gray-600">
                We analyze NOAA marine forecasts, wind conditions, and active
                advisories for your route.
              </p>
            </div>
            <div>
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-medium mb-1">Risk Assessment</h3>
              <p className="text-sm text-gray-600">
                Our system calculates a 0-100 disruption risk score based on
                conditions and historical patterns.
              </p>
            </div>
            <div>
              <div className="text-2xl mb-2">⚠️</div>
              <h3 className="font-medium mb-1">Official Status</h3>
              <p className="text-sm text-gray-600">
                We also display operator-reported status when available, clearly
                separated from predictions.
              </p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Important:</strong> This is a prediction tool, not an official
          source. Always check with your ferry operator for confirmed schedules
          and cancellations. We show the{' '}
          <em>risk of disruption</em> based on weather conditions, not
          definitive outcomes.
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-600">
          <p>
            Ferry Forecast is not affiliated with any ferry operator.
          </p>
          <p className="mt-1">
            Data sources: NOAA Marine Forecast, NWS Advisories, NOAA CO-OPS
            Tides
          </p>
        </div>
      </footer>
    </div>
  );
}
