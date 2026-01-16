/**
 * Port Content Data
 *
 * Phase 91: Authoritative Port Content
 *
 * This file contains all editorial content for port pages.
 * Content follows No-Guessing Rules strictly.
 *
 * VERIFIED ROUTES (as of Jan 2025):
 * - Steamship Authority (SSA): Woods Hole ↔ Vineyard Haven (year-round)
 * - Steamship Authority (SSA): Woods Hole ↔ Oak Bluffs (seasonal, ~May-Oct)
 * - Steamship Authority (SSA): Hyannis ↔ Nantucket (year-round)
 * - Hy-Line Cruises: Hyannis ↔ Nantucket (year-round)
 * - Hy-Line Cruises: Hyannis ↔ Oak Bluffs (seasonal, ~May-Oct)
 * - Island Queen: Falmouth ↔ Oak Bluffs (seasonal, ~late May-mid Oct)
 *
 * NOTE: Hy-Line does NOT operate Hyannis → Vineyard Haven.
 */

// ============================================================
// TYPES
// ============================================================

export interface RouteInfo {
  route: string;
  operator: string;
  seasonal?: string;
  operatorUrl: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface PortContent {
  // Identification
  slug: string;
  name: string;
  fullName: string;
  coordinates: { lat: number; lon: number };

  // SEO
  seo: {
    title: string;
    description: string;
  };

  // Editorial Content
  overview: string;
  seasonalRole: string;
  weatherImpact: string;
  commonReasons: string[];
  travelerAdvice: string;

  // Accordion summary (shorter version for homepage)
  accordionSummary: string;

  // Routes
  routes: RouteInfo[];

  // External Resources
  externalLinks: Array<{
    label: string;
    href: string;
    description: string;
  }>;

  // FAQ
  faqs: FAQ[];
}

// ============================================================
// PORT CONTENT DATA
// ============================================================

export const PORT_CONTENT: Record<string, PortContent> = {
  'woods-hole': {
    slug: 'woods-hole',
    name: 'Woods Hole',
    fullName: 'Woods Hole Ferry Terminal',
    coordinates: { lat: 41.5235, lon: -70.6724 },

    seo: {
      title: 'Woods Hole Ferry Terminal | Martha\'s Vineyard Ferry Departures',
      description: 'Woods Hole is the primary mainland departure point for Martha\'s Vineyard ferries. Learn about weather conditions, ferry connections, and what affects service.',
    },

    overview: `Woods Hole is the primary mainland departure point for Martha's Vineyard, serving as the Steamship Authority's busiest terminal. This small scientific village sits at the southwestern tip of Cape Cod, where Vineyard Sound meets Buzzards Bay. The terminal handles both passenger and vehicle ferries year-round, making it the lifeline for island residents and visitors alike.`,

    seasonalRole: `Woods Hole operates year-round as the main gateway to Martha's Vineyard. During peak summer months, the terminal handles significantly higher traffic, with seasonal service to Oak Bluffs supplementing the year-round Vineyard Haven route. Winter service continues daily, though with reduced frequency.`,

    weatherImpact: `The geographic position of Woods Hole creates distinct weather challenges. Southwest winds can build significant swells across Buzzards Bay before reaching the terminal, as there is substantial open water (fetch) from that direction. The narrow passage between Woods Hole and the Elizabeth Islands can amplify tidal currents, which combine with wind-driven seas to affect vessel maneuvering.

Northeast and easterly conditions, common during winter storms, present different challenges. While the harbor provides some shelter from these directions, sustained stormy conditions from the northeast can still disrupt operations.

Fog is another consideration, particularly during spring and early summer when warm air moves over cooler waters. Reduced visibility can affect departure timing, though modern navigation equipment has reduced fog-related delays compared to decades past.

All operating decisions rest with vessel captains who assess real-time conditions for each sailing. Conditions that seem manageable from shore may be significantly different in the open waters of Vineyard Sound.`,

    commonReasons: [
      'Wind-driven seas from the southwest creating difficult conditions in Buzzards Bay',
      'Strong tidal currents through Woods Hole Passage affecting vessel control',
      'Northeast storms bringing sustained adverse conditions',
      'Reduced visibility from fog, particularly in spring',
      'Mechanical or operational factors unrelated to weather',
    ],

    travelerAdvice: `If traveling through Woods Hole, always verify your departure status directly with the Steamship Authority before leaving home. Weather conditions can change rapidly, and decisions about service are made on a sailing-by-sailing basis. During busy periods, vehicle reservations are strongly recommended and often required. Foot passengers generally have more flexibility but should still confirm departures during adverse weather.`,

    accordionSummary: `The Steamship Authority's busiest terminal, serving year-round ferries to Vineyard Haven and seasonal service to Oak Bluffs. Southwest winds and tidal currents through the narrow passage are the primary weather factors affecting operations here.`,

    routes: [
      {
        route: 'Woods Hole → Vineyard Haven',
        operator: 'Steamship Authority',
        operatorUrl: 'https://www.steamshipauthority.com',
      },
      {
        route: 'Woods Hole → Oak Bluffs',
        operator: 'Steamship Authority',
        seasonal: 'Seasonal (May–Oct)',
        operatorUrl: 'https://www.steamshipauthority.com',
      },
    ],

    externalLinks: [
      {
        label: 'Steamship Authority',
        href: 'https://www.steamshipauthority.com',
        description: 'Official schedules, reservations, and real-time status',
      },
      {
        label: 'Town of Falmouth',
        href: 'https://www.falmouthma.gov',
        description: 'Local information and parking',
      },
    ],

    faqs: [
      {
        question: 'Why do ferries from Woods Hole get affected by weather?',
        answer: 'Woods Hole sits where Vineyard Sound meets Buzzards Bay, with exposure to winds from multiple directions. Southwest winds can build seas across the open bay, while the narrow passage creates tidal currents. Captains assess these conditions for each sailing.',
      },
      {
        question: 'Is Woods Hole service year-round?',
        answer: 'Yes. The Steamship Authority operates year-round service between Woods Hole and Vineyard Haven. Seasonal service to Oak Bluffs runs approximately May through October.',
      },
      {
        question: 'How do I know if my ferry is running?',
        answer: 'Check directly with the Steamship Authority website or call their customer service line. Conditions can change quickly, so verify close to your departure time.',
      },
      {
        question: 'Do I need a vehicle reservation?',
        answer: 'Vehicle reservations are required during peak periods and strongly recommended at other times. Check with the Steamship Authority for current reservation policies.',
      },
    ],
  },

  'hyannis': {
    slug: 'hyannis',
    name: 'Hyannis',
    fullName: 'Hyannis Harbor Ferry Terminal',
    coordinates: { lat: 41.6519, lon: -70.2834 },

    seo: {
      title: 'Hyannis Ferry Terminal | Nantucket & Martha\'s Vineyard Ferries',
      description: 'Hyannis Harbor serves ferries to Nantucket year-round and seasonal service to Oak Bluffs. Learn about conditions affecting the longer Nantucket crossing.',
    },

    overview: `Hyannis serves as the gateway to Nantucket and offers seasonal service to Oak Bluffs on Martha's Vineyard. Located on the south shore of Cape Cod, the Ocean Street Dock area handles both Steamship Authority car ferries and Hy-Line's high-speed and traditional ferries. The protected inner harbor provides good shelter, though the longer crossing to Nantucket means open-water conditions matter significantly.`,

    seasonalRole: `Hyannis operates year-round for Nantucket service, with both the Steamship Authority and Hy-Line Cruises providing options. Seasonal service to Oak Bluffs via Hy-Line runs approximately May through October. During summer, the terminal area becomes quite busy with multiple operators serving different destinations.`,

    weatherImpact: `The Hyannis harbor itself is relatively protected, so conditions at the dock often differ substantially from conditions on Nantucket Sound. This means that while departures may proceed, the crossing conditions can be challenging.

South and southwest winds can build significant seas across Nantucket Sound during the crossing. The 26-mile route to Nantucket is the longest in the region, giving wind and waves more distance to build. Different vessel types respond differently to these conditions—high-speed ferries are generally more sensitive to wave action than traditional ferries.

Easterly conditions can also affect operations, particularly when combined with offshore swells. Winter storms from the northeast may bring sustained periods of difficult conditions.

Captains and operators make real-time decisions about service based on current and forecasted conditions. A crossing that seems feasible in one direction may be reconsidered based on conditions encountered.`,

    commonReasons: [
      'Sustained winds building seas across the long Nantucket Sound crossing',
      'Wave conditions affecting passenger comfort and safety',
      'High-speed ferry sensitivity to sea state',
      'Visibility reduction from fog or precipitation',
      'Conditions that develop during the crossing',
    ],

    travelerAdvice: `For Nantucket travel, verify service status with both the Steamship Authority and Hy-Line Cruises, as they make independent operating decisions. High-speed ferry cancellations don't necessarily mean traditional ferry cancellations. During peak season, book vehicle reservations well in advance for Nantucket—availability is limited. If you're flexible, having backup plans for different departure times or ferry types can help during marginal weather.`,

    accordionSummary: `Gateway to Nantucket with year-round service from the Steamship Authority and Hy-Line Cruises. Also offers seasonal Hy-Line service to Oak Bluffs. The long Nantucket crossing makes this route particularly sensitive to sea conditions.`,

    routes: [
      {
        route: 'Hyannis → Nantucket',
        operator: 'Steamship Authority',
        operatorUrl: 'https://www.steamshipauthority.com',
      },
      {
        route: 'Hyannis → Nantucket',
        operator: 'Hy-Line Cruises',
        operatorUrl: 'https://www.hylinecruises.com',
      },
      {
        route: 'Hyannis → Oak Bluffs',
        operator: 'Hy-Line Cruises',
        seasonal: 'Seasonal (May–Oct)',
        operatorUrl: 'https://www.hylinecruises.com',
      },
    ],

    externalLinks: [
      {
        label: 'Steamship Authority',
        href: 'https://www.steamshipauthority.com',
        description: 'Official schedules, reservations, and real-time status',
      },
      {
        label: 'Hy-Line Cruises',
        href: 'https://www.hylinecruises.com',
        description: 'High-speed and traditional ferry service',
      },
      {
        label: 'Town of Barnstable',
        href: 'https://www.townofbarnstable.us',
        description: 'Local information and parking',
      },
    ],

    faqs: [
      {
        question: 'Why is the Nantucket route more weather-sensitive?',
        answer: 'The 26-mile crossing to Nantucket is the longest in the region, giving wind and waves more distance to build across Nantucket Sound. Even moderate winds can create challenging conditions over that distance.',
      },
      {
        question: 'If the high-speed ferry cancels, will the traditional ferry run?',
        answer: 'Not necessarily, but traditional ferries are generally less sensitive to wave action than high-speed ferries. The operators make independent decisions. Check with both the Steamship Authority and Hy-Line for their respective service status.',
      },
      {
        question: 'Does Hy-Line go to Vineyard Haven from Hyannis?',
        answer: 'No. Hy-Line operates seasonal service from Hyannis to Oak Bluffs on Martha\'s Vineyard, not to Vineyard Haven. Year-round Vineyard service from the mainland is available through Woods Hole.',
      },
      {
        question: 'How far in advance should I book for Nantucket?',
        answer: 'Vehicle reservations for Nantucket should be booked as far in advance as possible, especially for summer travel. Foot passenger space is generally more available but can fill during peak periods.',
      },
    ],
  },

  'falmouth': {
    slug: 'falmouth',
    name: 'Falmouth',
    fullName: 'Falmouth Inner Harbor (Island Queen)',
    coordinates: { lat: 41.5416, lon: -70.6086 },

    seo: {
      title: 'Falmouth Ferry Terminal | Island Queen to Oak Bluffs',
      description: 'Falmouth Inner Harbor is home to the Island Queen, a seasonal passenger ferry to Oak Bluffs on Martha\'s Vineyard. Learn about this popular day-trip option.',
    },

    overview: `Falmouth Inner Harbor is home to the Island Queen, a passenger-only ferry service to Oak Bluffs that operates seasonally from late May through mid-October. The smaller vessel and shorter crossing time make this a popular option for day-trippers who don't need their car on the Vineyard. The harbor's location provides good protection from most wind directions.`,

    seasonalRole: `The Island Queen operates only during the warmer months, typically late May through mid-October. This makes it a summer and early fall option rather than a year-round service. For off-season travel to Martha's Vineyard, travelers need to use the Steamship Authority from Woods Hole.`,

    weatherImpact: `The Island Queen is a smaller vessel than the Steamship Authority ferries, which can make it more responsive to sea conditions. The relatively short crossing to Oak Bluffs means less exposure to open water, but the route still passes through areas that can be affected by wind-driven seas.

Southwest winds can create challenging conditions as the ferry passes the Elizabeth Islands, where there is more exposure to Buzzards Bay swells. The harbor departure itself is well-protected.

Fog can occasionally affect early morning departures during summer months when warm air meets cooler ocean waters.

Operating decisions are made by the Island Queen crew based on conditions. As a smaller operation, the service may have different thresholds for comfort than larger vessels, though this varies by conditions and circumstances.`,

    commonReasons: [
      'Wind-driven seas in the waters near the Elizabeth Islands',
      'Conditions that affect smaller vessel comfort and safety',
      'Morning fog reducing visibility',
      'End-of-season weather transitions',
    ],

    travelerAdvice: `The Island Queen is a good option for day trips when you don't need a vehicle. However, remember it's seasonal-only and doesn't run during adverse weather. Check the Island Queen website or call before heading to the dock. If you need guaranteed transportation or vehicle access, consider the Steamship Authority from Woods Hole as a backup or alternative.`,

    accordionSummary: `Home to the Island Queen, a seasonal passenger-only ferry to Oak Bluffs running late May through mid-October. Popular with day-trippers, though the smaller vessel can be more affected by sea conditions than larger ferries.`,

    routes: [
      {
        route: 'Falmouth → Oak Bluffs',
        operator: 'Island Queen',
        seasonal: 'Seasonal (late May–mid Oct)',
        operatorUrl: 'https://islandqueen.com',
      },
    ],

    externalLinks: [
      {
        label: 'Island Queen Ferry',
        href: 'https://islandqueen.com',
        description: 'Schedules, tickets, and service updates',
      },
      {
        label: 'Town of Falmouth',
        href: 'https://www.falmouthma.gov',
        description: 'Local information and parking',
      },
    ],

    faqs: [
      {
        question: 'Is the Island Queen a good option for day trips?',
        answer: 'Yes, the Island Queen is popular with day-trippers visiting Oak Bluffs. The crossing is shorter than from Woods Hole, and foot passenger service is straightforward. Just remember to check the schedule and weather conditions.',
      },
      {
        question: 'Can I bring my car on the Island Queen?',
        answer: 'No, the Island Queen is passenger-only. For vehicle transportation to Martha\'s Vineyard, you need the Steamship Authority from Woods Hole.',
      },
      {
        question: 'What if the Island Queen cancels?',
        answer: 'If the Island Queen isn\'t running, your alternative is the Steamship Authority from nearby Woods Hole. Check their availability, as they operate independently and may still be running.',
      },
      {
        question: 'When does the Island Queen season run?',
        answer: 'Typically late May through mid-October, though exact dates vary by year. Check their website for the current season schedule.',
      },
    ],
  },

  'vineyard-haven': {
    slug: 'vineyard-haven',
    name: 'Vineyard Haven',
    fullName: 'Vineyard Haven Ferry Terminal',
    coordinates: { lat: 41.4532, lon: -70.6024 },

    seo: {
      title: 'Vineyard Haven Ferry Terminal | Martha\'s Vineyard Year-Round Service',
      description: 'Vineyard Haven is Martha\'s Vineyard\'s year-round ferry terminal, receiving Steamship Authority ferries from Woods Hole. Learn about harbor conditions and service.',
    },

    overview: `Vineyard Haven is Martha's Vineyard's year-round ferry terminal and the island's commercial center. All Steamship Authority car ferries from Woods Hole dock here. The harbor sits in a natural inlet on the island's northern shore, providing reasonable protection from prevailing winds while remaining accessible in most conditions.`,

    seasonalRole: `Vineyard Haven operates year-round as the primary arrival point for Martha's Vineyard. During summer, it shares traffic with Oak Bluffs, but in the off-season it handles all Steamship Authority arrivals. The town functions as the island's main commercial hub regardless of season.`,

    weatherImpact: `Vineyard Haven harbor sits in a natural indentation on Martha's Vineyard's northern shore. This geography provides shelter from southwest winds, which are blocked by the island itself.

Northeast and easterly conditions present different challenges. These wind directions blow more directly toward the harbor entrance and can create swells that make the approach and docking more difficult. During significant northeast storms, ferries may occasionally divert to Oak Bluffs if conditions there are more favorable, though this depends on many factors.

The approach to Vineyard Haven requires vessels to navigate through the harbor entrance, which can be affected by wave action during certain conditions. Captains assess these conditions for each arrival and make decisions accordingly.

Fog affects visibility in the harbor area, particularly during temperature transitions in spring and fall.`,

    commonReasons: [
      'Northeast winds creating swells at the harbor entrance',
      'Easterly conditions affecting the approach',
      'Combination of wind and wave factors during storms',
      'Fog reducing visibility for harbor navigation',
    ],

    travelerAdvice: `As Martha's Vineyard's year-round terminal, Vineyard Haven is typically your destination when arriving by Steamship Authority ferry. During adverse northeast weather, you may arrive at Oak Bluffs instead—the captain makes this decision based on conditions. Plan your island transportation with this flexibility in mind, especially during stormy weather.`,

    accordionSummary: `Martha's Vineyard's year-round ferry terminal, receiving all Steamship Authority service from Woods Hole. Northeast winds can affect the harbor approach, occasionally leading to diversions to Oak Bluffs during storms.`,

    routes: [
      {
        route: 'Woods Hole → Vineyard Haven',
        operator: 'Steamship Authority',
        operatorUrl: 'https://www.steamshipauthority.com',
      },
    ],

    externalLinks: [
      {
        label: 'Steamship Authority',
        href: 'https://www.steamshipauthority.com',
        description: 'Official schedules, reservations, and real-time status',
      },
      {
        label: 'Town of Tisbury',
        href: 'https://www.tisburyma.gov',
        description: 'Local government and visitor information',
      },
    ],

    faqs: [
      {
        question: 'Why might my ferry go to Oak Bluffs instead of Vineyard Haven?',
        answer: 'During northeast storms or other conditions that make Vineyard Haven\'s harbor approach difficult, captains may divert to Oak Bluffs where conditions might be more favorable. This is a real-time decision based on safety.',
      },
      {
        question: 'Is Vineyard Haven the only year-round terminal on Martha\'s Vineyard?',
        answer: 'Yes, Vineyard Haven is the only terminal receiving year-round ferry service. Oak Bluffs service is seasonal, typically May through October.',
      },
      {
        question: 'What town is Vineyard Haven in?',
        answer: 'Vineyard Haven is the main village in the town of Tisbury on Martha\'s Vineyard.',
      },
      {
        question: 'Can I get to Vineyard Haven from Hyannis?',
        answer: 'There is no direct ferry service from Hyannis to Vineyard Haven. Hy-Line operates seasonal service from Hyannis to Oak Bluffs only. For Vineyard Haven, use the Steamship Authority from Woods Hole.',
      },
    ],
  },

  'oak-bluffs': {
    slug: 'oak-bluffs',
    name: 'Oak Bluffs',
    fullName: 'Oak Bluffs Harbor Ferry Terminal',
    coordinates: { lat: 41.456, lon: -70.5583 },

    seo: {
      title: 'Oak Bluffs Ferry Terminal | Martha\'s Vineyard Seasonal Service',
      description: 'Oak Bluffs is Martha\'s Vineyard\'s seasonal ferry hub with service from Woods Hole, Falmouth, and Hyannis. Learn about this popular summer destination.',
    },

    overview: `Oak Bluffs serves as Martha's Vineyard's seasonal ferry hub, with service from Woods Hole (Steamship Authority), Falmouth (Island Queen), and Hyannis (Hy-Line). The harbor is a man-made breakwater-protected basin on the island's eastern shore. Famous for its Victorian gingerbread cottages and lively summer scene, Oak Bluffs sees heavy ferry traffic from Memorial Day through Labor Day.`,

    seasonalRole: `Oak Bluffs ferry service operates seasonally, typically May through October. During this period, it provides an alternative to Vineyard Haven for arriving passengers, with the added convenience of service from multiple mainland ports. In the off-season, travelers must use Vineyard Haven via Woods Hole.`,

    weatherImpact: `Oak Bluffs harbor is protected by a man-made breakwater, which provides good shelter from north and west winds. This protection means the harbor itself is often calmer than open water.

East and southeast winds present the greatest challenges because they blow more directly into the harbor entrance. Under these conditions, swells can enter the harbor basin, affecting docking operations. When easterly conditions are significant, ferries scheduled for Oak Bluffs may divert to Vineyard Haven instead, where the island provides more shelter from that direction.

The harbor's relatively shallow approach can also create choppy conditions that affect vessel handling, particularly for the larger car ferries.

Fog occasionally affects the Oak Bluffs area, as with other island ports, though this is more common in spring and early summer.`,

    commonReasons: [
      'East and southeast winds pushing swells into the harbor entrance',
      'Choppy conditions in the relatively shallow approach',
      'Fog affecting visibility during certain weather patterns',
      'Diversions from Vineyard Haven during northeast conditions',
    ],

    travelerAdvice: `Oak Bluffs offers convenient access to the island's summer attractions and serves as an alternative arrival point to Vineyard Haven. During the season, you may have multiple ferry options from different mainland ports. Be aware that easterly weather can affect Oak Bluffs more than Vineyard Haven, so your scheduled port may change based on conditions. Check your specific operator for current status.`,

    accordionSummary: `Martha's Vineyard's seasonal ferry hub receiving service from three mainland ports: Woods Hole, Falmouth, and Hyannis. The breakwater-protected harbor can be affected by easterly winds, sometimes resulting in diversions to Vineyard Haven.`,

    routes: [
      {
        route: 'Woods Hole → Oak Bluffs',
        operator: 'Steamship Authority',
        seasonal: 'Seasonal (May–Oct)',
        operatorUrl: 'https://www.steamshipauthority.com',
      },
      {
        route: 'Falmouth → Oak Bluffs',
        operator: 'Island Queen',
        seasonal: 'Seasonal (late May–mid Oct)',
        operatorUrl: 'https://islandqueen.com',
      },
      {
        route: 'Hyannis → Oak Bluffs',
        operator: 'Hy-Line Cruises',
        seasonal: 'Seasonal (May–Oct)',
        operatorUrl: 'https://www.hylinecruises.com',
      },
    ],

    externalLinks: [
      {
        label: 'Steamship Authority',
        href: 'https://www.steamshipauthority.com',
        description: 'Vehicle ferry schedules and reservations',
      },
      {
        label: 'Hy-Line Cruises',
        href: 'https://www.hylinecruises.com',
        description: 'Passenger ferry from Hyannis',
      },
      {
        label: 'Island Queen Ferry',
        href: 'https://islandqueen.com',
        description: 'Passenger ferry from Falmouth',
      },
      {
        label: 'Town of Oak Bluffs',
        href: 'https://www.oakbluffsma.gov',
        description: 'Local government and visitor information',
      },
    ],

    faqs: [
      {
        question: 'Can I get to Oak Bluffs year-round?',
        answer: 'No, ferry service to Oak Bluffs is seasonal, typically May through October. For off-season travel to Martha\'s Vineyard, use the Steamship Authority from Woods Hole to Vineyard Haven.',
      },
      {
        question: 'Which ferry should I take to Oak Bluffs?',
        answer: 'You have three options during the season: Steamship Authority from Woods Hole (vehicle ferry), Island Queen from Falmouth (passengers only), and Hy-Line from Hyannis (passengers only). Choose based on your departure location and whether you need a vehicle.',
      },
      {
        question: 'What if weather diverts my ferry to Vineyard Haven?',
        answer: 'Both towns are on Martha\'s Vineyard and connected by local transportation. A diversion adds some travel time but still gets you to the island. Check local bus schedules or taxi options.',
      },
      {
        question: 'Is Oak Bluffs close to other Vineyard towns?',
        answer: 'Yes, Oak Bluffs is adjacent to Vineyard Haven and connected to other island towns by bus and road. The ferry diversion between ports typically adds minimal impact to your overall trip.',
      },
    ],
  },

  'nantucket': {
    slug: 'nantucket',
    name: 'Nantucket',
    fullName: 'Nantucket Steamboat Wharf',
    coordinates: { lat: 41.2858, lon: -70.0972 },

    seo: {
      title: 'Nantucket Ferry Terminal | Year-Round Service from Hyannis',
      description: 'Nantucket\'s Steamboat Wharf is the island\'s sole ferry connection. Learn about the 26-mile crossing from Hyannis and how weather affects this longer route.',
    },

    overview: `Nantucket's Steamboat Wharf is the island's sole ferry connection to the mainland, located in the heart of Nantucket Town's historic district. Both Steamship Authority and Hy-Line Cruises operate year-round service from Hyannis, with traditional and high-speed options. The 26-mile crossing—the longest in the region—makes this route particularly sensitive to weather conditions.`,

    seasonalRole: `Unlike Martha's Vineyard, Nantucket has only one ferry terminal operating year-round. Both the Steamship Authority and Hy-Line provide service throughout the year, though frequency increases significantly during summer months. The island relies entirely on this single connection for passenger and freight service.`,

    weatherImpact: `The 26-mile crossing between Hyannis and Nantucket is the longest ferry route in the Cape and Islands region. This distance means that wind and waves have more opportunity to build across Nantucket Sound, and conditions can change during the roughly one to two-hour crossing.

Sustained winds from any direction can create challenging sea conditions over this distance. The sound is relatively shallow in many areas, which can cause steeper wave patterns than deeper water would produce.

Different ferry types respond differently to sea conditions. High-speed ferries, which make the crossing in about an hour, may suspend service while traditional ferries continue to operate, or vice versa in some circumstances. The operators make independent decisions about their respective services.

Nantucket harbor itself is well-protected once vessels enter, but the open-water crossing determines service feasibility.

Fog can reduce visibility for the crossing, though it tends to be more common in certain seasons and weather patterns.`,

    commonReasons: [
      'Wind-driven seas building across the long Nantucket Sound crossing',
      'Sea conditions affecting passenger safety and comfort',
      'Different vessel types responding differently to conditions',
      'Fog or precipitation reducing visibility',
      'Conditions that develop or change during the crossing',
    ],

    travelerAdvice: `Nantucket travel requires more weather awareness than shorter routes due to the 26-mile crossing. Check conditions and service status with both the Steamship Authority and Hy-Line before heading to Hyannis—they operate independently and may have different status. Book vehicle reservations as far ahead as possible; Nantucket vehicle space is limited and competitive. Having flexibility in your travel timing helps during marginal weather periods.`,

    accordionSummary: `Nantucket's sole ferry connection, served year-round by both the Steamship Authority and Hy-Line Cruises from Hyannis. The 26-mile crossing is the region's longest, making it more sensitive to sea conditions than shorter routes.`,

    routes: [
      {
        route: 'Hyannis → Nantucket',
        operator: 'Steamship Authority',
        operatorUrl: 'https://www.steamshipauthority.com',
      },
      {
        route: 'Hyannis → Nantucket',
        operator: 'Hy-Line Cruises',
        operatorUrl: 'https://www.hylinecruises.com',
      },
    ],

    externalLinks: [
      {
        label: 'Steamship Authority',
        href: 'https://www.steamshipauthority.com',
        description: 'Vehicle ferry schedules and reservations',
      },
      {
        label: 'Hy-Line Cruises',
        href: 'https://www.hylinecruises.com',
        description: 'High-speed and traditional passenger ferries',
      },
      {
        label: 'Town of Nantucket',
        href: 'https://www.nantucket-ma.gov',
        description: 'Local government and visitor information',
      },
    ],

    faqs: [
      {
        question: 'Why is the Nantucket ferry more likely to be affected by weather?',
        answer: 'The 26-mile crossing is significantly longer than other Cape and Islands routes. This gives wind and waves more distance to build, and conditions can change during the one to two-hour trip. Captains and operators assess whether the full crossing is feasible.',
      },
      {
        question: 'If the fast ferry cancels, should I expect the slow ferry to run?',
        answer: 'Not necessarily, though traditional ferries can sometimes operate when high-speed ferries cannot. The Steamship Authority and Hy-Line make independent decisions. Check with each operator for their current service status.',
      },
      {
        question: 'How far ahead should I book vehicle space to Nantucket?',
        answer: 'As far as possible, especially for summer travel. Nantucket vehicle ferry space is limited and in high demand. Some travelers book months in advance for peak season.',
      },
      {
        question: 'Is there any alternative to the ferry for reaching Nantucket?',
        answer: 'Nantucket has a small airport with flights from various locations, though these can also be affected by weather. The ferry remains the primary connection for most travelers and all vehicle transport.',
      },
    ],
  },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get port content by slug
 */
export function getPortContent(slug: string): PortContent | null {
  return PORT_CONTENT[slug] || null;
}

/**
 * Get all port slugs
 */
export function getAllPortSlugs(): string[] {
  return Object.keys(PORT_CONTENT);
}

/**
 * Get all ports as array
 */
export function getAllPorts(): PortContent[] {
  return Object.values(PORT_CONTENT);
}
