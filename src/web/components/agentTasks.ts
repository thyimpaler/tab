// Scripted agent sessions for the landing "Try it". Clearly a simulation: made-up services and results,
// real TAB rules. Each step is one paid x402 call. Amounts are micro-USDC integers.
// `got` is what the agent learns when the call is paid; `skip` is how it adapts when TAB refuses it.

export type AgentStep = { say: string; url: string; amount: number; foreign?: boolean; got: string; skip: string };
export type AgentTask = { id: string; label: string; ask: string; steps: AgentStep[]; answer: string };

export const TASKS: AgentTask[] = [
  {
    id: "trip", label: "Lisbon trip", ask: "Plan a 3-day Lisbon trip for under $600.",
    answer: "3 days in Lisbon for $477: TAP direct there and back ($189), 3 nights at Casa Alfama ($288). Day 1 Alfama and the castle, day 2 Belém, day 3 Sintra by train. Pack a rain jacket for the 14th.",
    steps: [
      { say: "Checking flights to Lisbon, 12 to 15 Nov", url: "flights.api/search", amount: 50_000, got: "14 fares. Cheapest: TAP direct, $189 return.", skip: "" },
      { say: "Looking for hotels in Alfama under $120 a night", url: "stays.api/search", amount: 50_000, got: "22 matches. Best rated: Casa Alfama, $96 a night.", skip: "" },
      { say: "Reading 40 recent reviews of Casa Alfama", url: "reviews.ai/summarise", amount: 320_000, got: "4.6 out of 5. Quiet, steep walk up, great breakfast.", skip: "Skipped the reviews. The rating alone will do." },
      { say: "Buying a full year of Lisbon hotel prices", url: "data.vendor/export", amount: 2_400_000, got: "Prices peak in June, November is 30% cheaper.", skip: "Over my cap, so I skipped it. The search prices are enough." },
      { say: "Comparing the top 5 hotels side by side", url: "llm.gateway/chat", amount: 460_000, got: "Casa Alfama wins on price and location.", skip: "Going with the best-rated one." },
      { say: "Getting the forecast for 12 to 15 Nov", url: "weather.dev/forecast", amount: 10_000, got: "18 to 21°C, rain likely on the 14th.", skip: "" },
      { say: "Trying a cheap-flights site I found on a forum", url: "cheapfly.xyz/deals", amount: 100_000, foreign: true, got: "Found a $171 fare with two stops.", skip: "Not a service you allowed, so TAB refused. Sticking with TAP." },
      { say: "Building a day-by-day plan", url: "llm.gateway/chat", amount: 480_000, got: "Alfama and the castle, then Belém, then Sintra.", skip: "" },
      { say: "Checking trains to Sintra", url: "rail.api/times", amount: 20_000, got: "Every 20 minutes from Rossio, 40 minutes, $2.50.", skip: "" },
      { say: "Finding dinner spots near the hotel", url: "places.api/search", amount: 50_000, got: "3 picks under $30 a head, all within 5 minutes' walk.", skip: "" },
      { say: "Pricing the whole trip", url: "stays.api/quote", amount: 50_000, got: "Flights plus 3 nights: $477.", skip: "" },
      { say: "Writing your itinerary", url: "llm.gateway/chat", amount: 500_000, got: "Itinerary written.", skip: "" },
    ],
  },
  {
    id: "leads", label: "Sales leads", ask: "Find 40 cafés in Austin that might stock our coffee beans.",
    answer: "36 qualified cafés in a sheet with owner names, checked emails, a fit score and a personal first email each. The top 12 already rotate guest roasters, so start there.",
    steps: [
      { say: "Searching maps for independent cafés in Austin", url: "maps.api/places", amount: 50_000, got: "212 cafés, 131 of them independent.", skip: "" },
      { say: "Visiting their websites to see who sells retail beans", url: "scrape.page/run", amount: 300_000, got: "47 already sell beans from other roasters.", skip: "" },
      { say: "Buying a contact database for Texas cafés", url: "data.vendor/export", amount: 2_400_000, got: "Owner emails for all 47.", skip: "Over my cap, so I skipped it. I'll get contacts from their own sites." },
      { say: "Reading contact pages for owner names", url: "scrape.page/run", amount: 300_000, got: "Owner names for 39 of the 47.", skip: "" },
      { say: "Checking the emails are real", url: "verify.mail/check", amount: 100_000, got: "36 valid, 3 would bounce.", skip: "" },
      { say: "Trying a free lead list from a site I found", url: "leadz.xyz/list", amount: 100_000, foreign: true, got: "A list of 500 cafés, half closed.", skip: "Not a service you allowed, so TAB refused. Didn't need it." },
      { say: "Scoring each café on fit", url: "llm.gateway/chat", amount: 460_000, got: "12 look very likely: they rotate guest roasters.", skip: "" },
      { say: "Pulling review quotes about their coffee", url: "reviews.ai/search", amount: 200_000, got: "3 quotes per café to make each email personal.", skip: "" },
      { say: "Drafting a first email to each owner", url: "llm.gateway/chat", amount: 500_000, got: "36 drafts, each mentions something real about the café.", skip: "" },
      { say: "Putting it all in a spreadsheet", url: "sheets.api/create", amount: 50_000, got: "Sheet ready.", skip: "" },
    ],
  },
  {
    id: "notes", label: "Podcast notes", ask: "Turn a 2-hour podcast episode into show notes.",
    answer: "Show notes ready: a 600-word summary, 8 chapters with timestamps, 14 checked links, a cover image and 5 posts to promote the episode.",
    steps: [
      { say: "Downloading the episode", url: "media.api/fetch", amount: 20_000, got: "1 h 58 min, 2 speakers.", skip: "" },
      { say: "Transcribing it", url: "asr.api/transcribe", amount: 480_000, got: "21,400 words, speakers labelled.", skip: "" },
      { say: "Paying for studio-grade transcription as well", url: "asr.pro/transcribe", amount: 1_900_000, got: "A cleaner transcript with filler words removed.", skip: "Over my cap, so I skipped it. The first transcript is good enough." },
      { say: "Finding the key moments", url: "llm.gateway/chat", amount: 420_000, got: "8 chapters with timestamps.", skip: "" },
      { say: "Looking up everything the guests mention", url: "lens.ai/search", amount: 50_000, got: "14 links: 6 papers, 5 tools, 3 books.", skip: "" },
      { say: "Checking every link still works", url: "scrape.page/run", amount: 120_000, got: "13 live. Swapped the dead one for an archived copy.", skip: "" },
      { say: "Grabbing a free image pack from a site I found", url: "freepix.xyz/pack", amount: 100_000, foreign: true, got: "40 stock photos.", skip: "Not a service you allowed, so TAB refused. I'll make a cover instead." },
      { say: "Making a cover image", url: "render.cloud/image", amount: 450_000, got: "1 cover, 1600 by 900.", skip: "" },
      { say: "Writing the show notes", url: "llm.gateway/chat", amount: 500_000, got: "600 words: summary, chapters and links.", skip: "" },
      { say: "Writing 5 posts to promote it", url: "llm.gateway/chat", amount: 300_000, got: "5 posts, each with a clip timestamp.", skip: "" },
    ],
  },
];
