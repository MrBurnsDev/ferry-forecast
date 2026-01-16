/**
 * No-Guessing Ferry Content Rules
 *
 * Phase 91: Content Accuracy Standards
 *
 * This ruleset governs all user-facing content about ferry operations,
 * weather impacts, and service reliability. It must be followed for:
 * - Port pages
 * - Accordion summaries
 * - FAQ content
 * - Any educational copy
 *
 * CORE PRINCIPLE: We inform, we don't predict.
 * We explain patterns, we don't promise outcomes.
 */

// ============================================================
// PROHIBITED LANGUAGE
// ============================================================

/**
 * Never use these patterns in user-facing content
 */
export const PROHIBITED_PATTERNS = {
  // Numeric thresholds that imply safety limits
  numericThresholds: [
    'winds above X mph',
    'seas exceed X feet',
    'gusts over X',
    'visibility below X miles',
    'waves reach X feet',
  ],

  // Predictive certainties
  predictions: [
    'will be canceled',
    'will run normally',
    'expect cancellations',
    'ferries will divert',
    'service will resume',
    'safe to travel when',
  ],

  // Implied operator behavior
  operatorPromises: [
    'operators cancel when',
    'ferries stop running at',
    'service halts if',
    'always runs unless',
    'guaranteed to operate',
  ],

  // False precision
  falsePrecision: [
    'typically cancels at exactly',
    'the threshold is',
    'the cutoff for',
    'operates up to',
  ],

  // AI/model references
  aiReferences: [
    'our model predicts',
    'AI analysis shows',
    'algorithm determines',
    'machine learning suggests',
  ],
} as const;

// ============================================================
// ALLOWED PHRASING PATTERNS
// ============================================================

/**
 * Use these patterns to communicate uncertainty appropriately
 */
export const ALLOWED_PATTERNS = {
  // Probabilistic language
  probability: [
    'tends to',
    'often',
    'may',
    'can',
    'sometimes',
    'historically',
    'in some conditions',
  ],

  // Directional patterns (without thresholds)
  directions: [
    'winds from the southwest can create challenges',
    'northeast conditions often affect',
    'easterly winds may impact',
  ],

  // Captain discretion emphasis
  captainDiscretion: [
    'captains make real-time decisions',
    'operating decisions depend on conditions',
    'crews assess conditions before each sailing',
    'final decisions rest with vessel operators',
  ],

  // Deference to operators
  operatorDeference: [
    'check with your ferry operator',
    'confirm directly with the operator',
    'operators provide real-time status',
    'verify current conditions with',
  ],

  // Pattern description without prediction
  patternDescription: [
    'this direction is known for',
    'historically challenging when',
    'conditions that have affected service include',
    'factors that can influence operations',
  ],
} as const;

// ============================================================
// CONTENT GUIDELINES
// ============================================================

/**
 * Guidelines for specific content scenarios
 */
export const CONTENT_GUIDELINES = {
  /**
   * When describing weather impact:
   * - Explain WHY weather causes issues (physics, geography)
   * - Do NOT say WHEN cancellations occur
   * - Emphasize variability and captain judgment
   */
  weatherImpact: {
    do: [
      'Explain the geographic exposure of the port',
      'Describe which wind directions create fetch',
      'Note differences between harbor and open water',
      'Mention vessel type sensitivities generally',
    ],
    dont: [
      'State specific wind speed thresholds',
      'Claim specific wave height limits',
      'Promise outcomes at certain conditions',
      'Imply universal cancellation rules',
    ],
  },

  /**
   * When describing routes:
   * - State only verified, current routes
   * - Include operator name for each route
   * - Mark seasonal services clearly
   * - Never invent or assume routes
   */
  routeDescriptions: {
    do: [
      'List verified routes with operators',
      'Mark seasonal availability',
      'Link to official operator pages',
    ],
    dont: [
      'Assume routes based on geography',
      'Claim routes without verification',
      'Promise year-round service without confirmation',
    ],
  },

  /**
   * When writing FAQs:
   * - Answer what we KNOW, not what we predict
   * - Defer to operators for operational questions
   * - Focus on educational context
   */
  faqContent: {
    do: [
      'Explain why weather matters',
      'Describe what factors affect service',
      'Direct users to authoritative sources',
    ],
    dont: [
      'Promise specific service outcomes',
      'Claim to know when ferries will run',
      'Suggest our site replaces operator information',
    ],
  },
} as const;

// ============================================================
// WHEN TO DEFER TO OPERATORS
// ============================================================

/**
 * Always defer to operators for:
 */
export const ALWAYS_DEFER = [
  'Current operating status',
  'Schedule changes',
  'Cancellation decisions',
  'Rebooking policies',
  'Reservation availability',
  'Fare information',
  'Vehicle reservation requirements',
  'Specific departure times',
] as const;

// ============================================================
// WHEN TO AVOID NUMBERS ENTIRELY
// ============================================================

/**
 * Never include numeric thresholds for:
 */
export const NEVER_USE_NUMBERS = [
  'Wind speed cancellation thresholds',
  'Wave height limits',
  'Visibility minimums',
  'Gust speed cutoffs',
  'Sea state ratings',
  'Beaufort scale references as limits',
] as const;

// ============================================================
// WEATHER IMPACT DESCRIPTION FRAMEWORK
// ============================================================

/**
 * Framework for describing weather impact without thresholds
 *
 * Instead of: "Winds above 25 mph cause cancellations"
 * Use: "Strong southwest winds can create challenging conditions
 *       because they blow across open water with significant fetch,
 *       building seas that affect vessel stability and passenger comfort."
 */
export const WEATHER_DESCRIPTION_FRAMEWORK = {
  /**
   * Step 1: Name the direction or condition
   * "Southwest winds", "Northeast storms", "Dense fog"
   */
  nameCondition: 'Name the weather pattern without numeric qualifiers',

  /**
   * Step 2: Explain the physics/geography
   * "create fetch across Buzzards Bay", "blow into the harbor entrance"
   */
  explainWhy: 'Describe WHY this condition matters (fetch, exposure, visibility)',

  /**
   * Step 3: Describe the effect
   * "can create challenging sea conditions", "may reduce visibility"
   */
  describeEffect: 'Use probabilistic language for the operational effect',

  /**
   * Step 4: Emphasize variability
   * "Captains assess conditions for each sailing"
   */
  emphasizeVariability: 'Note that decisions depend on real-time assessment',
} as const;

// ============================================================
// CONTENT REVIEW CHECKLIST
// ============================================================

/**
 * Before publishing any ferry content, verify:
 */
export const CONTENT_CHECKLIST = [
  'Does this contain numeric thresholds? → Remove them',
  'Does this promise specific outcomes? → Reframe as possibilities',
  'Does this imply we know operator decisions? → Defer to operators',
  'Could a reader interpret this as a guarantee? → Add uncertainty language',
  'Would a ferry operator object to this framing? → Revise',
  'Does this help an anxious traveler feel informed? → Keep',
  'Does this replace the need to check with operators? → Reframe',
] as const;
