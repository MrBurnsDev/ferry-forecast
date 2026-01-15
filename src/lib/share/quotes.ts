/**
 * Mystery Share Quote Library
 *
 * A large collection of playful, safe quotes for sharing ferry predictions.
 * Grouped by outcome, confidence tier, and theme.
 *
 * Safety constraints (non-negotiable):
 * - Funny, absurd, clever, playful
 * - Never mean, never insulting, never derogatory, never shaming
 * - No profanity, no politics, no real people, no protected class targeting
 * - First person voice
 * - 1-2 sentences max
 * - Boasting ONLY for contrarian wins (correctly predicted low-probability outcomes)
 */

export type Outcome = 'correct' | 'incorrect';
export type ConfidenceTier = 'high' | 'medium' | 'low' | 'very_low';
export type Theme = 'pirate' | 'wizard' | 'sailor' | 'academic' | 'lighthouse' | 'weather' | 'oracle' | 'cartographer';
export type Region = 'marthas_vineyard' | 'nantucket' | 'cape_cod';

export interface QuotePool {
  [outcome: string]: {
    [tier: string]: {
      [theme: string]: string[];
    };
  };
}

export interface RegionalQuotePool {
  [region: string]: {
    [outcome: string]: {
      [tier: string]: string[];
    };
  };
}

// ============================================================
// CORRECT PREDICTIONS - HIGH CONFIDENCE (>= 75%)
// Standard "I got it right" quotes - humble, playful
// ============================================================

const correctHighPirate: string[] = [
  "Arr, me compass pointed true today!",
  "Even a barnacle-covered hull can read these waters.",
  "The sea whispered her secrets, and I listened well.",
  "My parrot could've called this one, but I got there first.",
  "Another voyage logged in the captain's book of wins.",
  "The winds favored this old sea dog's prediction.",
  "Shiver me timbers, I actually knew what I was doing!",
  "My treasure map led straight to the right answer.",
  "The kraken of doubt has been vanquished!",
  "Hoisted the right flag on this sailing.",
  "My spyglass sees all, especially ferry departures.",
  "Davy Jones owes me a drink for this call.",
  "The tides of fortune smiled upon my forecast.",
  "Me pirate instincts be sharper than a cutlass today.",
  "This salty dog sniffed out the right answer.",
];

const correctHighWizard: string[] = [
  "My crystal ball is working overtime today.",
  "The ancient scrolls of ferry wisdom guided me true.",
  "I consulted the stars, and the stars did not lie.",
  "My wand of weather prediction struck gold!",
  "The magical arts of forecasting prevail once more.",
  "Even my owl is impressed with this prediction.",
  "The enchanted algorithm speaks through me.",
  "I saw this outcome in my morning tea leaves.",
  "My sorcery extends to maritime schedules, apparently.",
  "The ferry spirits have blessed my forecast.",
  "Abracadabra, alakazam, I called it right again!",
  "My mystical ferry senses are tingling with success.",
  "The prophecy has been fulfilled. Next sailing, please.",
  "I cast the prediction spell, and it landed perfectly.",
  "The cauldron of forecast accuracy bubbles with pride.",
];

const correctHighSailor: string[] = [
  "Steady as she goes, another good call logged.",
  "The old seafarer's intuition served me well.",
  "Reading the weather is like reading an old friend.",
  "My nautical instincts are still sharp.",
  "Another successful voyage through the prediction seas.",
  "The helm held true on this forecast.",
  "Fair winds confirmed, prediction locked in.",
  "My sea legs carried me to the right answer.",
  "The maritime gods nod in approval.",
  "Anchors aweigh with this correct prediction!",
  "Smooth sailing on this forecast call.",
  "The compass of experience pointed the right way.",
  "Another notch on the ship's wheel of predictions.",
  "My weather eye caught this one clearly.",
  "The sailor's sixth sense strikes again.",
];

const correctHighAcademic: string[] = [
  "The data supported my hypothesis. Science wins!",
  "Peer review would approve of this methodology.",
  "My statistical analysis was spot-on.",
  "The research paper of predictions writes itself today.",
  "I've added this to my growing dataset of correct calls.",
  "The algorithm and I are in perfect sync.",
  "Empirical evidence supports my ferry forecasting skills.",
  "My dissertation on ferry predictions grows stronger.",
  "The control group of doubt has been disproven.",
  "Correlation and causation aligned beautifully today.",
  "My probability model holds up under scrutiny.",
  "The academic rigor of my prediction is unimpeachable.",
  "I'll cite this success in my next paper.",
  "The peer-reviewed journal of ferries would publish this.",
  "My meteorological credentials remain intact.",
];

const correctHighLighthouse: string[] = [
  "My beacon of prediction shone bright and true.",
  "The lighthouse keeper sees all from the tower of forecasts.",
  "Guiding ships and predictions safely to shore.",
  "My light pierced through the fog of uncertainty.",
  "From the tower, the truth was always visible.",
  "The lamp of ferry wisdom burns bright tonight.",
  "Another vessel guided safely by my forecast light.",
  "The lighthouse of predictions stands tall once more.",
  "Illuminating the path to correct ferry calls.",
  "My beacon never wavers, and neither did this prediction.",
  "The foghorn of accuracy sounds triumphantly.",
  "Standing watch over the seas of prediction, undefeated.",
  "The lighthouse keeper's log marks another success.",
  "My coastal vigil yields another correct forecast.",
  "The light at the end of the prediction tunnel was real.",
];

const correctHighWeather: string[] = [
  "The barometer of my intuition was perfectly calibrated.",
  "I read the clouds like a book, and the story was clear.",
  "The wind whispered the answer before the ferry left.",
  "My weather station of predictions delivers again.",
  "The atmospheric pressure of success feels amazing.",
  "I felt this forecast in my bones. They were right!",
  "The meteorological muses smiled upon my prediction.",
  "High pressure system of correct calls continues.",
  "My forecast accuracy is approaching personal best.",
  "The isobars of prediction aligned perfectly.",
  "Another sunny day in my forecast accuracy record.",
  "The humidity of doubt evaporated with this win.",
  "My weather vane pointed to success.",
  "Precipitation probability: 100% chance of being right.",
  "The forecast for my forecasts: continued accuracy.",
];

const correctHighOracle: string[] = [
  "The visions showed me true. The ferry obeyed.",
  "I gazed into the future and saw victory.",
  "The oracle's track record grows ever stronger.",
  "My third eye sees ferries with remarkable clarity.",
  "The spirits of prediction confirmed my sight.",
  "Destiny aligned with my forecast today.",
  "The prophecy was written, and it came to pass.",
  "My mystical ferry divination proves accurate again.",
  "The cosmic ferry schedule bends to my vision.",
  "I foresaw this outcome in my morning meditation.",
  "The oracle's wisdom extends to maritime matters.",
  "The universe confirmed my prediction. Thanks, universe!",
  "My prophetic powers extend to ferry operations.",
  "The future revealed itself, and I was ready.",
  "Fate and forecast intertwined successfully.",
];

const correctHighCartographer: string[] = [
  "I mapped the route to success and followed it precisely.",
  "My charts never lie, especially about ferries.",
  "The coordinates of prediction accuracy: nailed it.",
  "Another successful journey through the forecast terrain.",
  "My prediction compass pointed true north to victory.",
  "The topology of this forecast was crystal clear.",
  "I plotted the course and the ferry followed.",
  "My cartographic intuition serves me well at sea.",
  "The map of ferry outcomes favored my route today.",
  "Latitude and longitude of success: exactly where I predicted.",
  "My navigational skills extend to weather patterns.",
  "The terrain of this prediction was familiar territory.",
  "I surveyed the forecast landscape and conquered it.",
  "My atlas of ferry wisdom grows one page richer.",
  "The geography of prediction aligned with my charts.",
];

// ============================================================
// CORRECT PREDICTIONS - MEDIUM CONFIDENCE (55-75%)
// Slightly more satisfied, still humble
// ============================================================

const correctMediumPirate: string[] = [
  "Arr, I had me doubts, but the seas proved me right!",
  "The waves were tricky, but this pirate prevailed.",
  "Not the easiest waters to read, but I found my way.",
  "Me compass wobbled, but it landed true.",
  "A moderate challenge for an experienced buccaneer.",
  "The fog lifted just in time for my prediction to shine.",
  "Even murky waters can't hide the truth from this captain.",
  "I navigated through uncertainty and found victory.",
  "The sea tested me, and I passed with flying colors.",
  "A fair fight between doubt and intuition. Intuition won.",
  "The treasure was harder to find, but find it I did.",
  "My pirate patience paid off handsomely.",
  "Through choppy prediction waters, I emerged victorious.",
  "The horizon was hazy, but I saw clearly enough.",
  "A worthy challenge for a seasoned seafarer.",
];

const correctMediumWizard: string[] = [
  "The runes were harder to read, but I deciphered them.",
  "My crystal ball flickered, but the vision held true.",
  "Not my easiest spell, but magic prevailed.",
  "The mystical energies were muddled, yet I found clarity.",
  "A challenging enchantment, successfully cast.",
  "The stars were partially obscured, but I read them anyway.",
  "My wizard's intuition overcame the uncertainty.",
  "The potion of prediction bubbled with moderate confidence.",
  "A test of magical skill, and I am satisfied.",
  "The arcane arts of ferry forecasting served me well.",
  "Through the mist of doubt, my vision held.",
  "Not a trivial spell, but well within my abilities.",
  "The magical forecast required extra concentration.",
  "My wand wavered, but the result was true.",
  "A moderately complex enchantment, executed successfully.",
];

const correctMediumSailor: string[] = [
  "The waters were choppy, but my instincts held firm.",
  "Not the clearest sailing conditions for prediction.",
  "I had to squint at the horizon, but I saw it right.",
  "A test of seamanship, and I passed with honors.",
  "The wind was fickle, but my judgment was sound.",
  "Through variable conditions, my forecast sailed true.",
  "My weather eye worked overtime on this one.",
  "A challenge worthy of an experienced sailor.",
  "The sea kept her secrets, but I uncovered them.",
  "Not an obvious call, but a correct one.",
  "My nautical intuition faced a real test today.",
  "The conditions were tricky, but experience prevailed.",
  "A moderate sea state for prediction difficulty.",
  "I earned this one through careful observation.",
  "The maritime gods made me work for this victory.",
];

const correctMediumAcademic: string[] = [
  "The data was noisy, but my analysis held up.",
  "A moderate p-value, but still significant!",
  "The hypothesis survived a challenging test.",
  "Not a slam dunk, but peer-reviewable nonetheless.",
  "The error bars were wider, but I stayed within them.",
  "A robust prediction despite the uncertainty.",
  "My confidence interval barely contained the truth.",
  "The model struggled, but ultimately delivered.",
  "A C+ difficulty problem solved with A+ accuracy.",
  "The statistical gremlins were active, but I prevailed.",
  "My methodology held up under moderate stress.",
  "Not the cleanest dataset, but I extracted the truth.",
  "The variance was high, but my prediction was higher.",
  "A test of academic rigor, passed with distinction.",
  "The research was challenging, but rewarding.",
];

const correctMediumLighthouse: string[] = [
  "The fog was thick, but my beam cut through.",
  "A challenging night for the lighthouse keeper.",
  "My light flickered, but it never went out.",
  "Through the mist, my prediction found its mark.",
  "Not the clearest conditions for guiding ships or forecasts.",
  "The storms tested my tower, but it stood firm.",
  "A keeper's vigilance rewarded with accuracy.",
  "My beacon worked overtime to illuminate this truth.",
  "The coastal watch was difficult, but successful.",
  "Through uncertain weather, my light prevailed.",
  "The fog of prediction lifted just in time.",
  "A test of the lighthouse's endurance and mine.",
  "My lamp burned bright against the encroaching doubt.",
  "The tower stood tall through the challenge.",
  "A worthy vigil rewarded with correct results.",
];

const correctMediumWeather: string[] = [
  "The atmospheric conditions were tricky to read.",
  "My barometer had to work for this prediction.",
  "Not the most cooperative weather pattern.",
  "The clouds were sending mixed signals, but I decoded them.",
  "A moderate weather system of prediction difficulty.",
  "My forecast accuracy weathered the uncertainty.",
  "The meteorological picture was hazy, but I saw through.",
  "A challenging day for weather-based predictions.",
  "The pressure systems were competing, but I chose correctly.",
  "My weather intuition faced a real test.",
  "Not an easy read, but an accurate one.",
  "The forecast conditions were variable, but I adapted.",
  "A test of meteorological skill, passed with flying colors.",
  "The weather patterns were subtle, but I caught them.",
  "My weather wisdom shone through the uncertainty.",
];

const correctMediumOracle: string[] = [
  "The visions were cloudier than usual, but true.",
  "My third eye squinted, but it saw correctly.",
  "The spirits whispered ambiguously, yet I understood.",
  "A challenging divination, successfully interpreted.",
  "The cosmic signals were weak, but I caught them.",
  "My oracle senses had to work for this one.",
  "The prophecy was veiled, but I unveiled it.",
  "Through the mystical haze, the truth emerged.",
  "A test of spiritual vision, and I passed.",
  "The universe was coy, but I read between the lines.",
  "My divination required extra meditation today.",
  "The future was harder to see, but I saw it.",
  "A moderately difficult prophecy, fulfilled.",
  "The cosmic ferry schedule was encrypted, but I decoded it.",
  "My mystic faculties were tested and proven true.",
];

const correctMediumCartographer: string[] = [
  "The terrain was unfamiliar, but I mapped it correctly.",
  "My charts faced a cartographic challenge.",
  "Not the clearest coordinates, but I found my way.",
  "The geography of this prediction was complex.",
  "A surveyor's challenge, met with precision.",
  "My mapping skills were put to the test.",
  "The route was winding, but I plotted it true.",
  "Through uncertain topography, I navigated successfully.",
  "A moderate exploration yielded correct results.",
  "My compass hesitated, but ultimately pointed true.",
  "The map had some blank spots, but I filled them in.",
  "A challenging landscape for prediction cartography.",
  "My navigational instincts overcame the terrain.",
  "The coordinates required careful calculation.",
  "A worthy expedition through the forecast wilderness.",
];

// ============================================================
// CORRECT PREDICTIONS - LOW CONFIDENCE (35-55%)
// More satisfied, still not boastful
// ============================================================

const correctLowPirate: string[] = [
  "Arr, the seas were rough but this pirate found the treasure!",
  "Against the odds, me ship sailed into victory harbor!",
  "The storms couldn't stop this buccaneer's prediction!",
  "When the waves say no, a true pirate says aye!",
  "I fought the uncertainty and won!",
  "Through the roughest waters, my prediction held!",
  "The sea threw everything at me, but I caught the right answer!",
  "A pirate's life is full of surprises, like this correct call!",
  "The kraken of doubt tried, but failed to drag me down!",
  "My pirate instincts conquered the storm of uncertainty!",
  "Even Poseidon couldn't sink this prediction!",
  "The treasure map was torn, but I pieced it together!",
  "Through fog and fury, I found my way!",
  "A true test of pirate mettle, and I prevailed!",
  "The most challenging voyage ended in victory!",
];

const correctLowWizard: string[] = [
  "The spell was complex, but my magic proved stronger!",
  "Against all magical odds, my enchantment held!",
  "The dark forces of uncertainty were vanquished!",
  "My wizard training prepared me for this challenge!",
  "When the runes said maybe, I said definitely!",
  "The hardest spells yield the sweetest victories!",
  "My crystal ball had cracks, but the vision was clear!",
  "Through the magical maelstrom, my prediction emerged!",
  "The arcane energies aligned despite the chaos!",
  "A true test of wizardly skill, triumphantly passed!",
  "Even the most obscure prophecies can come true!",
  "My magic overcame the interference of doubt!",
  "The mystical ferry forces bowed to my will!",
  "A complex enchantment, perfectly executed!",
  "The stars were scattered, but I read them anyway!",
];

const correctLowSailor: string[] = [
  "The seas were against me, but I sailed true!",
  "Through the storm of uncertainty, my prediction anchored!",
  "A true sailor's skill shines in difficult conditions!",
  "When the weather said no, my instincts said yes!",
  "I've weathered worse, but this one felt good!",
  "The toughest voyages yield the sweetest arrivals!",
  "My nautical wisdom conquered the chaos!",
  "Against wind and wave, my prediction stood!",
  "A sailor's intuition is forged in storms like this!",
  "The most challenging conditions, the most satisfying win!",
  "Through the squall of doubt, I emerged victorious!",
  "My sea legs carried me through the uncertainty!",
  "The maritime gods tested me, and I passed!",
  "A true test of seamanship, conquered with pride!",
  "When the horizon was unclear, my vision was not!",
];

const correctLowAcademic: string[] = [
  "The data was sparse, but my analysis triumphed!",
  "Against statistical odds, my hypothesis proved true!",
  "A challenging research problem, brilliantly solved!",
  "The noise was deafening, but I found the signal!",
  "My methodology held up under extreme conditions!",
  "The peer reviewers would be impressed by this one!",
  "Through the fog of insufficient data, clarity emerged!",
  "A PhD-level prediction problem, undergraduate-level solved!",
  "The error bars were enormous, but I hit the target!",
  "My academic training prepared me for this challenge!",
  "When the confidence interval was wide, my aim was true!",
  "The most rigorous test of my analytical skills!",
  "A statistical miracle, achieved through skill!",
  "My research instincts overcame the data limitations!",
  "The toughest dissertation chapter, successfully defended!",
];

const correctLowLighthouse: string[] = [
  "Through the thickest fog, my beacon found its mark!",
  "The storms raged, but my light never wavered!",
  "A lighthouse keeper's greatest challenge, conquered!",
  "When visibility was zero, my prediction was clear!",
  "The wildest seas couldn't extinguish my forecast light!",
  "My tower stood strong against the uncertainty!",
  "Through the longest night of doubt, dawn came!",
  "The fog was impenetrable, but my light found a way!",
  "A keeper's vigilance rewarded in the most challenging conditions!",
  "My beacon pierced through when others would fail!",
  "The coastal watch's finest hour of prediction!",
  "Through storm and shadow, my light guided true!",
  "The lighthouse of prediction stood against all odds!",
  "My lamp burned brightest when needed most!",
  "A test of lighthouse endurance, passed with honor!",
];

const correctLowWeather: string[] = [
  "The weather patterns were chaos, but I decoded them!",
  "Against meteorological odds, my forecast proved true!",
  "The most unpredictable conditions, perfectly predicted!",
  "My barometer defied the atmospheric chaos!",
  "When the weather said random, I said certain!",
  "Through the storm of variables, my prediction emerged!",
  "The weather gods threw everything at me, and I caught it!",
  "A meteorological miracle of prediction accuracy!",
  "The most challenging weather pattern I've ever read!",
  "My forecast accuracy conquered the chaos!",
  "Through atmospheric turmoil, clarity prevailed!",
  "The pressure systems were fighting, but I chose correctly!",
  "A weather warrior's finest prediction hour!",
  "The clouds were lying, but I saw through them!",
  "My weather wisdom triumphed over uncertainty!",
];

const correctLowOracle: string[] = [
  "The visions were murky, but my sight was clear!",
  "Against cosmic odds, the prophecy proved true!",
  "The spirits were silent, but I heard them anyway!",
  "Through the mystical interference, my vision held!",
  "The universe tried to hide the answer, but I found it!",
  "A divination of exceptional difficulty, nailed!",
  "My third eye saw clearly when the cosmos was clouded!",
  "The prophecy defied probability, as did I!",
  "Through the veil of uncertainty, truth emerged!",
  "The most challenging vision I've ever interpreted!",
  "When fate was uncertain, my oracle was not!",
  "The cosmic signals were scrambled, but I decoded them!",
  "A test of prophetic skill, triumphantly passed!",
  "My mystical faculties conquered the impossible!",
  "Through spiritual static, the message came through!",
];

const correctLowCartographer: string[] = [
  "The map was blank, but I charted the course anyway!",
  "Through uncharted territory, my prediction found its way!",
  "A cartographer's nightmare, successfully navigated!",
  "The coordinates were missing, but I calculated them!",
  "Against all mapping odds, my chart proved true!",
  "Through the terra incognita of prediction, I triumphed!",
  "My compass spun wildly, but I found true north!",
  "The most challenging expedition yielded correct results!",
  "When the map said 'here be dragons,' I said 'here be ferries!'",
  "Through unmapped waters, my prediction sailed true!",
  "A surveyor's greatest challenge, met with precision!",
  "My cartographic instincts conquered the unknown!",
  "The terrain was hostile, but I mapped it anyway!",
  "Through the wilderness of doubt, I blazed a trail!",
  "The most difficult navigation of my prediction career!",
];

// ============================================================
// CORRECT PREDICTIONS - VERY LOW CONFIDENCE (< 35%)
// BOASTING ALLOWED - Contrarian wins deserve celebration!
// ============================================================

const correctVeryLowPirate: string[] = [
  "BEHOLD! This pirate saw what no one else could see!",
  "The entire fleet doubted me, and the entire fleet was WRONG!",
  "I am the captain of contrarian predictions, bow before me!",
  "When everyone said impossible, I said WATCH THIS!",
  "My pirate legend grows with this magnificent call!",
  "The seas themselves trembled at my prediction prowess!",
  "I didn't just go against the tide, I CONQUERED it!",
  "This is the prediction that songs will be written about!",
  "Against all odds, this buccaneer called it perfectly!",
  "The treasure everyone said didn't exist? I FOUND IT!",
  "My prediction instincts are forged from pure gold!",
  "When the world said no chance, I said FULL SAIL AHEAD!",
  "This legendary call cements my place in prediction history!",
  "The impossible prediction? I made it look easy!",
  "Crown me the monarch of contrarian ferry calls!",
];

const correctVeryLowWizard: string[] = [
  "I AM THE GRAND WIZARD OF IMPOSSIBLE PREDICTIONS!",
  "The entire magical realm doubted me, and they were ALL wrong!",
  "Behold the magic that defies probability itself!",
  "My powers extend beyond what mortals call 'likely'!",
  "This spell will be taught in wizard schools for generations!",
  "Against cosmic odds, my sorcery proved supreme!",
  "The most improbable enchantment, PERFECTLY CAST!",
  "I didn't just read the future, I REWROTE IT!",
  "My crystal ball shows what others cannot imagine!",
  "The impossible prophecy? It's called SKILL!",
  "When magic said unlikely, I said ABRACADABRA!",
  "This legendary divination defies all mystical logic!",
  "My powers have transcended mere probability!",
  "The arcane arts bow before this prediction!",
  "I am the wizard who sees the unseeable!",
];

const correctVeryLowSailor: string[] = [
  "This is the call that separates legends from sailors!",
  "Against hurricane-force odds, I sailed to VICTORY!",
  "The sea herself could not believe I was right!",
  "When every chart said impossible, I drew my own!",
  "This is the prediction voyage of a LIFETIME!",
  "I navigated the impossible and emerged triumphant!",
  "The maritime record books await this entry!",
  "Against all nautical wisdom, my instincts proved TRUE!",
  "This legendary call will echo across the seven seas!",
  "When the ocean said never, I said NOW!",
  "My sailing intuition has achieved legendary status!",
  "The most improbable prediction in maritime history!",
  "I didn't just read the weather, I DEFIED it!",
  "This is the forecast that launches a thousand stories!",
  "Crown me admiral of impossible predictions!",
];

const correctVeryLowAcademic: string[] = [
  "This prediction deserves a NOBEL PRIZE!",
  "Against statistical impossibility, I PROVED THEM WRONG!",
  "My analysis has transcended the bounds of probability!",
  "The peer reviewers will study this for generations!",
  "When the data said impossible, I said PUBLISH!",
  "This legendary prediction rewrites the textbooks!",
  "My methodology has achieved breakthrough status!",
  "Against all academic odds, my hypothesis TRIUMPHED!",
  "This research will be cited for decades!",
  "The most improbable result in prediction science!",
  "I didn't just analyze the data, I TRANSCENDED it!",
  "This discovery belongs in the hall of scientific fame!",
  "My statistical prowess knows no bounds!",
  "When probability said no, I said YES!",
  "This legendary analysis defies mathematical explanation!",
];

const correctVeryLowLighthouse: string[] = [
  "My beacon shone through the IMPOSSIBLE darkness!",
  "When no light could reach, MINE DID!",
  "This is the legendary vigil that history will remember!",
  "Against all odds, my lighthouse stood SUPREME!",
  "The fog of impossibility bowed before my light!",
  "This prediction illuminated what others said was invisible!",
  "My tower has achieved lighthouse LEGEND status!",
  "When the night was absolute, I brought DAWN!",
  "This is the light that defied probability itself!",
  "The most improbable beacon in prediction history!",
  "My coastal vigil has achieved immortal status!",
  "Against impossible conditions, my lamp burned TRUE!",
  "This legendary light will guide predictions forever!",
  "I didn't just watch the coast, I CONQUERED IT!",
  "Crown me keeper of the impossible lighthouse!",
];

const correctVeryLowWeather: string[] = [
  "My forecast accuracy has achieved LEGENDARY status!",
  "Against meteorological impossibility, I TRIUMPHED!",
  "The weather itself was shocked by my prediction!",
  "This is the forecast that rewrites weather history!",
  "When the atmosphere said never, I said NOW!",
  "My barometer has transcended physical limitations!",
  "This legendary prediction defies all weather logic!",
  "Against all climatological odds, I called it PERFECTLY!",
  "The most improbable weather read in forecasting history!",
  "I didn't just predict the weather, I COMMANDED it!",
  "This forecast belongs in the meteorological hall of fame!",
  "My weather wisdom has achieved transcendent status!",
  "When probability storms raged, I stood FIRM!",
  "This is the prediction that weather scientists will study!",
  "Crown me the supreme weathermaster of ferry forecasts!",
];

const correctVeryLowOracle: string[] = [
  "My prophetic vision has achieved DIVINE status!",
  "The cosmos itself trembled at this prediction!",
  "Against cosmic impossibility, my sight proved TRUE!",
  "This is the prophecy that rewrites destiny itself!",
  "When the universe said impossible, I said WATCH!",
  "My oracle powers have transcended mortal limits!",
  "This legendary divination will echo through eternity!",
  "Against all spiritual odds, my vision was PERFECT!",
  "The most improbable prophecy ever fulfilled!",
  "I didn't just see the future, I CHOSE it!",
  "This vision belongs in the oracle hall of fame!",
  "My mystical faculties have achieved legendary status!",
  "When fate said no, I said YES!",
  "This is the prediction that destiny will remember!",
  "Crown me the supreme oracle of impossible outcomes!",
];

const correctVeryLowCartographer: string[] = [
  "My map has charted the IMPOSSIBLE territory!",
  "Against all cartographic odds, I found the way!",
  "This is the legendary expedition that history will remember!",
  "When every map said impossible, I DREW A NEW ONE!",
  "My navigational prowess has achieved legend status!",
  "This prediction charted waters no one believed existed!",
  "Against impossible coordinates, I calculated PERFECTLY!",
  "The most improbable journey in prediction cartography!",
  "I didn't just find the path, I CREATED it!",
  "This legendary chart will guide explorers forever!",
  "My compass has transcended physical limitations!",
  "When the terrain said never, I said HERE!",
  "This cartographic achievement belongs in museums!",
  "My surveying skills have achieved transcendent status!",
  "Crown me the supreme navigator of impossible predictions!",
];

// ============================================================
// INCORRECT PREDICTIONS - HIGH CONFIDENCE (>= 75%)
// Gentle, humble, self-deprecating humor
// ============================================================

const incorrectHighPirate: string[] = [
  "Arr, even the best pirates miss the harbor sometimes.",
  "Me compass must've been held upside down.",
  "The sea made a fool of this old pirate today.",
  "Well, back to pirate school for me.",
  "Even Blackbeard had his off days, right?",
  "The treasure map led to an empty chest this time.",
  "My parrot would've done better, honestly.",
  "The kraken of overconfidence got me again.",
  "This landlubber moment shall not be spoken of.",
  "I zigged when I should've zagged, matey.",
  "The winds of fortune blew in the wrong direction.",
  "My spyglass needs recalibration, apparently.",
  "The ghost ship of prediction errors strikes again.",
  "Well, nobody's perfect, especially not pirates.",
  "Time to swab the deck of my prediction skills.",
];

const incorrectHighWizard: string[] = [
  "My crystal ball must have had smudges.",
  "Even the greatest wizards cast duds sometimes.",
  "The magical energies were not with me today.",
  "My wand clearly needs new batteries.",
  "The stars aligned, just not in my favor.",
  "Back to wizard school for remedial forecasting.",
  "My enchantment fizzled spectacularly.",
  "The prophecy was more suggestion than certainty.",
  "Even Merlin had his off days, surely.",
  "My mystical mojo was on vacation today.",
  "The cauldron of confidence overflowed.",
  "Time to recalibrate my crystal ball.",
  "The runes were speaking a different language.",
  "My spell check failed me this time.",
  "The magical warranty on this prediction has expired.",
];

const incorrectHighSailor: string[] = [
  "The sea showed me who's really captain today.",
  "My weather eye needs new glasses.",
  "Even experienced sailors misread conditions sometimes.",
  "The ocean humbled me, as she always does.",
  "My nautical intuition took a coffee break.",
  "Time to go back to sailing school.",
  "The maritime gods had different plans.",
  "My compass must've been drunk.",
  "The old sea dog barked up the wrong wave.",
  "Anchors away? More like anchors astray.",
  "My sailor's sixth sense skipped this one.",
  "The tides of prediction turned against me.",
  "Well, even the best captains run aground.",
  "The helm of confidence steered me wrong.",
  "My sea legs got tangled on this one.",
];

const incorrectHighAcademic: string[] = [
  "My hypothesis has been thoroughly rejected.",
  "The peer reviewers would have a field day.",
  "Back to the research drawing board.",
  "My statistical confidence was misplaced.",
  "The data had other plans for my prediction.",
  "Time to revise my methodology... significantly.",
  "The error bars got the last laugh.",
  "My algorithm needs debugging, clearly.",
  "This result will not make it into my dissertation.",
  "The control group of reality won this round.",
  "My probability model has some explaining to do.",
  "Time for some remedial statistics courses.",
  "The scientific method humbled me today.",
  "My research needs more research, apparently.",
  "The peer review of reality was harsh but fair.",
];

const incorrectHighLighthouse: string[] = [
  "My beacon pointed ships in the wrong direction.",
  "The lighthouse keeper's log marks a humble day.",
  "My light guided predictions onto the rocks.",
  "The fog was thicker than I realized.",
  "Time to clean the lighthouse lenses.",
  "My coastal vigil yielded incorrect results.",
  "The lighthouse of overconfidence strikes again.",
  "My beam was bright, but my prediction was dim.",
  "The foghorn of accuracy went silent.",
  "Time to recalibrate my lighthouse intuition.",
  "My tower stood tall, but my forecast fell short.",
  "The keeper's log has a red entry today.",
  "My lighthouse needs a better GPS.",
  "The coastal watch was watching the wrong coast.",
  "My beacon of prediction flickered and failed.",
];

const incorrectHighWeather: string[] = [
  "My barometer was completely miscalibrated.",
  "The weather made a fool of my forecast.",
  "The clouds were speaking a language I didn't understand.",
  "Time to get my weather station serviced.",
  "The atmospheric pressure of failure weighs heavy.",
  "My meteorological intuition took the day off.",
  "The forecast for my forecasts: partly wrong.",
  "My weather vane pointed confidently in the wrong direction.",
  "The isobars lied to me, apparently.",
  "Time for some remedial meteorology.",
  "The precipitation of doubt should have fallen harder.",
  "My climate of confidence produced wrong results.",
  "The weather gods had different plans.",
  "My forecast accuracy experienced a cold front.",
  "The humidity of hubris got me again.",
];

const incorrectHighOracle: string[] = [
  "My visions were more hallucinations than prophecy.",
  "The spirits gave me a bum steer.",
  "My third eye needs new contacts.",
  "The cosmic signals were apparently crossed.",
  "Time to recalibrate my oracle senses.",
  "The prophecy was more fiction than forecast.",
  "My mystical faculties took a vacation.",
  "The universe was speaking, but I wasn't listening right.",
  "My divination could use some divine intervention.",
  "The crystal ball had some sort of glitch.",
  "My prophetic powers need a software update.",
  "The spirits of accuracy abandoned me today.",
  "Time to consult a better psychic.",
  "My cosmic GPS led me astray.",
  "The mystical warranty on this vision has expired.",
];

const incorrectHighCartographer: string[] = [
  "My map led to a completely different destination.",
  "Time to redraw my prediction charts.",
  "The coordinates I calculated were for another reality.",
  "My compass pointed confidently in the wrong direction.",
  "The cartography of confidence failed me.",
  "My surveying skills need recertification.",
  "The terrain I mapped was entirely fictional.",
  "My navigational instincts got lost.",
  "The atlas of prediction needs a reprint.",
  "My expedition arrived at the wrong conclusion.",
  "The geography of this forecast was all wrong.",
  "Time to buy a new prediction compass.",
  "My charts need serious revision.",
  "The route I plotted led nowhere near the truth.",
  "My cartographic confidence was misplaced.",
];

// ============================================================
// INCORRECT PREDICTIONS - LOW CONFIDENCE (< 75%)
// Very gentle, optimistic despite being wrong
// ============================================================

const incorrectLowPirate: string[] = [
  "Arr, it was a risky wager, and the sea won.",
  "Even the boldest pirates strike out sometimes.",
  "A long shot didn't land, but the adventure was fun.",
  "The risky prediction didn't pay off, but no regrets!",
  "I took a chance and the ocean laughed.",
  "Fortune favors the bold, just not this time.",
  "My adventurous prediction met a predictable end.",
  "The gamble didn't pay, but the spirit was right.",
  "Sometimes the treasure hunt ends empty-handed.",
  "A pirate's life is full of near misses.",
  "The risky seas claimed another bold prediction.",
  "I sailed into the storm knowing the odds.",
  "Fortune's wheel spun away from me today.",
  "The long shot missed, but I'll try again.",
  "Every pirate has a tale of the one that got away.",
];

const incorrectLowWizard: string[] = [
  "Even unlikely spells fail more often than they succeed.",
  "The magical odds were against me from the start.",
  "A bold enchantment met an expected fate.",
  "My risky spell fizzled, as risky spells do.",
  "The stars warned me, but I tried anyway.",
  "Magic isn't always on the side of the brave.",
  "My improbable prophecy remained improbable.",
  "The mystical dice rolled against me.",
  "Fortune favors the bold wizard, sometimes.",
  "A high-risk enchantment yielded predictable results.",
  "My adventurous divination didn't pan out.",
  "The crystal ball showed what I hoped, not what was.",
  "Even wizards can't always beat the odds.",
  "My ambitious spell met the gravity of probability.",
  "The magic of long shots didn't strike today.",
];

const incorrectLowSailor: string[] = [
  "I knew the odds, but a sailor has to try.",
  "The risky voyage ended as risky voyages do.",
  "Sometimes you sail into the storm and lose.",
  "The long-shot prediction didn't find harbor.",
  "Fortune favors the bold sailor, except today.",
  "I took a chance on choppy prediction waters.",
  "The adventurous forecast met a predictable fate.",
  "My risky sailing instincts didn't pan out.",
  "Sometimes the sea reminds you who's in charge.",
  "A bold prediction met the reality of probability.",
  "The high-risk voyage sank, but I'll sail again.",
  "My daring forecast was daringly wrong.",
  "The nautical gamble didn't pay this time.",
  "I charted a course against the odds and lost.",
  "Every sailor has tales of storms that won.",
];

const incorrectLowAcademic: string[] = [
  "The low probability held true. That's statistics for you.",
  "My risky hypothesis met its expected fate.",
  "The data warned me, but science requires bold tests.",
  "A long-shot theory remained a long shot.",
  "The improbable result stayed improbable.",
  "My adventurous analysis met reality's peer review.",
  "Statistics played the odds, and I lost.",
  "The bold hypothesis fell within expected parameters.",
  "My experimental prediction yielded control group results.",
  "Fortune favors the bold researcher, statistically speaking.",
  "The risky methodology produced risk-appropriate results.",
  "My ambitious analysis met the wall of probability.",
  "The error bars got the last laugh, as predicted.",
  "A high-variance prediction landed on the expected side.",
  "My daring statistical leap fell short, as odds suggested.",
];

const incorrectLowLighthouse: string[] = [
  "My light reached for unlikely ships and found darkness.",
  "The fog was thick, and my risky beam didn't cut through.",
  "A bold lighthouse gamble met the night.",
  "My adventurous beacon found no response.",
  "The risky coastal watch yielded expected results.",
  "Fortune favors the bold keeper, but not today.",
  "My improbable light didn't find its mark.",
  "The lighthouse of long shots flickered and faded.",
  "I reached for unlikely shores and found waves.",
  "The daring vigil ended as daring vigils sometimes do.",
  "My optimistic beam met the pessimistic truth.",
  "The risky illumination found only darkness.",
  "A bold lighthouse keeper's humble moment.",
  "My adventurous light landed on expected shores.",
  "The improbable beacon remained improbable.",
];

const incorrectLowWeather: string[] = [
  "The unlikely weather pattern stayed unlikely.",
  "My risky forecast met the reality of probability.",
  "The long-shot prediction landed on expected ground.",
  "I read the clouds with hope, not accuracy.",
  "The adventurous forecast met conservative weather.",
  "Fortune favors the bold meteorologist, sometimes.",
  "My improbable weather read stayed improbable.",
  "The atmospheric gamble didn't pay off.",
  "I bet against the forecast and the forecast won.",
  "The risky prediction met the steady reality.",
  "My daring weather call was daringly wrong.",
  "The optimistic barometer met the pessimistic truth.",
  "A bold forecast fell to conservative conditions.",
  "My adventurous meteorology met predictable weather.",
  "The unlikely conditions remained unlikely.",
];

const incorrectLowOracle: string[] = [
  "My improbable vision stayed in the realm of improbable.",
  "The risky prophecy met its expected fate.",
  "Fortune favors the bold oracle, but not this time.",
  "The unlikely divination remained unlikely.",
  "My adventurous cosmic reading landed on expected stars.",
  "The spirits warned me, but hope is its own magic.",
  "My daring prophecy was daringly optimistic.",
  "The cosmic gamble rolled predictable numbers.",
  "I saw what I hoped, not what was destined.",
  "The risky mystical reading met mundane reality.",
  "My improbable vision found probable outcomes.",
  "The bold oracle's humble correction arrives.",
  "Fortune's unlikely path took expected turns.",
  "My adventurous divination met careful fate.",
  "The long-shot prophecy stayed long.",
];

const incorrectLowCartographer: string[] = [
  "My map to unlikely treasure found expected emptiness.",
  "The risky route led to predictable destinations.",
  "Fortune favors the bold explorer, except today.",
  "My adventurous charts led to mundane shores.",
  "The improbable coordinates stayed improbable.",
  "I mapped hopeful terrain and found reality.",
  "The daring expedition ended at expected coordinates.",
  "My risky navigation met conservative geography.",
  "The long-shot route remained long.",
  "Fortune's unlikely path took expected turns.",
  "My optimistic charts met pessimistic topography.",
  "The bold cartographer's humble correction arrives.",
  "I surveyed hopeful lands and found likely ones.",
  "The improbable journey arrived at probable destinations.",
  "My adventurous mapping met predictable terrain.",
];

// ============================================================
// REGIONAL QUOTES - Martha's Vineyard
// ============================================================

const regionalMarthasVineyardCorrectHigh: string[] = [
  "The island vibes guided my prediction perfectly.",
  "Martha's Vineyard weather secrets are safe with me.",
  "The Vineyard Sound revealed its truth to me.",
  "Another correct call from the Vineyard prediction desk.",
  "The island ferry spirits smiled upon my forecast.",
  "Oak Bluffs accuracy, Edgartown precision.",
  "The Vineyard Haven of correct predictions.",
  "My Martha's Vineyard intuition strikes again.",
  "The island wisdom flows through my forecasts.",
  "Chilmark confidence, Aquinnah accuracy.",
];

const regionalMarthasVineyardCorrectLow: string[] = [
  "Even the Vineyard weather couldn't fool me!",
  "Against Vineyard Sound odds, I prevailed!",
  "The island mystery couldn't hide the truth!",
  "Through the Vineyard fog, my vision was clear!",
  "The unpredictable Vineyard weather, predicted!",
];

const regionalMarthasVineyardIncorrect: string[] = [
  "The Vineyard weather outfoxed me this time.",
  "Martha's Vineyard keeps her secrets today.",
  "The island spirits had other plans for my forecast.",
  "Vineyard Sound showed me who's boss.",
  "The Vineyard fog was thicker than my prediction.",
];

// ============================================================
// REGIONAL QUOTES - Nantucket
// ============================================================

const regionalNantucketCorrectHigh: string[] = [
  "The Grey Lady's secrets are no match for me.",
  "Nantucket weather wisdom guides my forecasts.",
  "The island 30 miles out, perfectly predicted.",
  "Nantucket Sound revealed its truth to me.",
  "The Grey Lady smiled on my prediction today.",
  "From the cobblestones to the forecast, all correct.",
  "Nantucket precision, lighthouse accuracy.",
  "The island's mystery was no mystery to me.",
  "Whaling-era intuition, modern accuracy.",
  "The Nantucket ferry spirits approved my forecast.",
];

const regionalNantucketCorrectLow: string[] = [
  "Even the Grey Lady couldn't hide this truth!",
  "Against Nantucket's famous fog, I saw clearly!",
  "The island 30 miles out, still couldn't fool me!",
  "Through Nantucket's mysteries, my vision prevailed!",
  "The unpredictable Grey Lady, predicted!",
];

const regionalNantucketIncorrect: string[] = [
  "The Grey Lady kept her secrets today.",
  "Nantucket's famous fog got the best of me.",
  "The island 30 miles out, 30 miles from my prediction.",
  "Nantucket Sound had different plans.",
  "The Grey Lady's mystery remains intact.",
];

// ============================================================
// REGIONAL QUOTES - Cape Cod
// ============================================================

const regionalCapeCodCorrectHigh: string[] = [
  "Cape Cod weather wisdom at its finest.",
  "The Cape's Atlantic secrets guide my forecasts.",
  "From Provincetown to Falmouth, my prediction holds.",
  "The hook-shaped peninsula of correct predictions.",
  "Cape Cod Bay revealed its truth to me.",
  "The Cape's salty wisdom flows through my forecasts.",
  "Atlantic accuracy, Cape Cod precision.",
  "The Cape's weather secrets are safe with me.",
  "From the dunes to the data, all correct.",
  "Cape Cod confidence, perfectly calibrated.",
];

const regionalCapeCodCorrectLow: string[] = [
  "Even Cape Cod's wild weather couldn't fool me!",
  "Against the Cape's Atlantic fury, I prevailed!",
  "Through the Cape Cod fog, my vision was clear!",
  "The peninsula's secrets were no match for me!",
  "The unpredictable Cape, predicted!",
];

const regionalCapeCodIncorrect: string[] = [
  "The Cape's Atlantic winds outfoxed me.",
  "Cape Cod weather keeps her secrets today.",
  "The peninsula had different plans for my forecast.",
  "Cape Cod Bay showed me who's boss.",
  "The Cape's fog was thicker than my prediction.",
];

// ============================================================
// EXPORT: Main Quote Pool Structure
// ============================================================

export const QUOTE_POOL: QuotePool = {
  correct: {
    high: {
      pirate: correctHighPirate,
      wizard: correctHighWizard,
      sailor: correctHighSailor,
      academic: correctHighAcademic,
      lighthouse: correctHighLighthouse,
      weather: correctHighWeather,
      oracle: correctHighOracle,
      cartographer: correctHighCartographer,
    },
    medium: {
      pirate: correctMediumPirate,
      wizard: correctMediumWizard,
      sailor: correctMediumSailor,
      academic: correctMediumAcademic,
      lighthouse: correctMediumLighthouse,
      weather: correctMediumWeather,
      oracle: correctMediumOracle,
      cartographer: correctMediumCartographer,
    },
    low: {
      pirate: correctLowPirate,
      wizard: correctLowWizard,
      sailor: correctLowSailor,
      academic: correctLowAcademic,
      lighthouse: correctLowLighthouse,
      weather: correctLowWeather,
      oracle: correctLowOracle,
      cartographer: correctLowCartographer,
    },
    very_low: {
      pirate: correctVeryLowPirate,
      wizard: correctVeryLowWizard,
      sailor: correctVeryLowSailor,
      academic: correctVeryLowAcademic,
      lighthouse: correctVeryLowLighthouse,
      weather: correctVeryLowWeather,
      oracle: correctVeryLowOracle,
      cartographer: correctVeryLowCartographer,
    },
  },
  incorrect: {
    high: {
      pirate: incorrectHighPirate,
      wizard: incorrectHighWizard,
      sailor: incorrectHighSailor,
      academic: incorrectHighAcademic,
      lighthouse: incorrectHighLighthouse,
      weather: incorrectHighWeather,
      oracle: incorrectHighOracle,
      cartographer: incorrectHighCartographer,
    },
    low: {
      pirate: incorrectLowPirate,
      wizard: incorrectLowWizard,
      sailor: incorrectLowSailor,
      academic: incorrectLowAcademic,
      lighthouse: incorrectLowLighthouse,
      weather: incorrectLowWeather,
      oracle: incorrectLowOracle,
      cartographer: incorrectLowCartographer,
    },
  },
};

export const REGIONAL_QUOTES: RegionalQuotePool = {
  marthas_vineyard: {
    correct: {
      high: regionalMarthasVineyardCorrectHigh,
      low: regionalMarthasVineyardCorrectLow,
    },
    incorrect: {
      high: regionalMarthasVineyardIncorrect,
      low: regionalMarthasVineyardIncorrect,
    },
  },
  nantucket: {
    correct: {
      high: regionalNantucketCorrectHigh,
      low: regionalNantucketCorrectLow,
    },
    incorrect: {
      high: regionalNantucketIncorrect,
      low: regionalNantucketIncorrect,
    },
  },
  cape_cod: {
    correct: {
      high: regionalCapeCodCorrectHigh,
      low: regionalCapeCodCorrectLow,
    },
    incorrect: {
      high: regionalCapeCodIncorrect,
      low: regionalCapeCodIncorrect,
    },
  },
};

export const THEMES: Theme[] = ['pirate', 'wizard', 'sailor', 'academic', 'lighthouse', 'weather', 'oracle', 'cartographer'];

// Count total quotes
let totalQuotes = 0;
for (const outcome of Object.keys(QUOTE_POOL)) {
  for (const tier of Object.keys(QUOTE_POOL[outcome])) {
    for (const theme of Object.keys(QUOTE_POOL[outcome][tier])) {
      totalQuotes += QUOTE_POOL[outcome][tier][theme].length;
    }
  }
}
for (const region of Object.keys(REGIONAL_QUOTES)) {
  for (const outcome of Object.keys(REGIONAL_QUOTES[region])) {
    for (const tier of Object.keys(REGIONAL_QUOTES[region][outcome])) {
      totalQuotes += REGIONAL_QUOTES[region][outcome][tier].length;
    }
  }
}

export const TOTAL_QUOTE_COUNT = totalQuotes;
