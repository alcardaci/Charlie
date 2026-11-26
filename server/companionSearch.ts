type Turn = { role: string; content: string }
type SearchChoice = 'required' | 'none' | 'auto'

// Only make the choice for clear requests. The model can search on other turns.
const searchRequest = /\b(?:search (?:the )?(?:web|internet|news)|look (?:it |this |that )?up|browse (?:the )?(?:web|internet)|check (?:online|the news)|find (?:current |recent )?sources)\b/i
const noWeb = /\b(?:without (?:a )?(?:web search|browsing)|(?:do not|don't|no need to) (?:browse|search)|no web search)\b/i
const localOnly = /\b(?:only use|use only|solely (?:using|from)|based (?:only|solely) on|using (?:only|just))\s+(?:(?:the|my|this|these|provided|visible|supplied)\s+){0,3}(?:chart|graph|panel|workspace|screen|table|data|numbers|scenario|assumptions)\b/i
const workspaceRef = /(?:@\w+|\b(?:this|that|these|those|the|my|our|visible|displayed) (?:price )?(?:graph|chart|plot|dashboard|panel|workspace|screen|portfolio|holdings|watchlist|feed|table|hotspots?|widget|card|positions?)\b|\bon (?:my |the )?screen\b)/i
const freshness = /\b(?:latest|recent(?:ly)?|breaking|newest|news|currently|right now|today|yesterday|tomorrow|upcoming|ytd|(?:this|last|next)[ -](?:(?:\d+|few|six|twelve) )?(?:days?|weeks?|months?|quarters?|years?)|current (?:price|rate|yield|odds|valuation|consensus|status|events?|projections?|figures?))\b/i
const outlook = /\b(?:forecasts?|forecasting|forecasted|predict(?:ions?|s|ed|ing)?|outlooks?|projections?|(?:price|analyst) targets?|analyst (?:ratings?|estimates?|consensus)|consensus estimates?|earnings (?:estimates?|expectations?|guidance|date)|catalysts?|what(?:'s| is) (?:next|ahead)|what to expect|prospects?|upside potential)\b/i
const futureOutcome = /\b(?:will .{1,72} (?:rise|fall|trade|rally|recover|report|announce|cut|hike|win|happen|perform|go|be worth|cost|hit|beat|miss|reach)|where (?:will|could|might|is) .{1,60} (?:go|trade|head(?:ed|ing)?))\b/i
const externalEvidence = /\b(?:what (?:caused|drove|triggered)|why (?:did|has|is|was) .{0,55}\b(?:drop|fall|jump|rally|crash|ris(?:e|ing)|up|down)|(?:behind|driving) (?:the|this|today.s) (?:move|drop|rally)|(?:verify|corroborate) (?:this|the|these)|what happened (?:to|with)|trading at|when (?:is|are|will) .{0,45}\b(?:earnings|elections?|meeting|reports?|announce))\b/i
const localReading = /\b(?:explain|interpret|summari[sz]e|read|show(?:s|ing)?|display(?:s|ed)?|represent|mean(?:s)?|see|looking at|listed|according to|from)\b/i
const shownInWorkspace = /\b(?:shown|displayed|listed|visible|plotted) (?:here|there|(?:in|on|by) (?:this|that|my|the))\b|\b(?:according to|in) (?:my|this|the) (?:news feed|feed|predictions panel)\b/i
const methodology = /\b(?:definition of|difference between|how (?:are|is) .{1,60} (?:calculated|computed|made|produced|derived)|how (?:do|does) .{1,50} (?:work|calculate|construct|produce|forecast earnings|set (?:their )?price targets)|how (?:to|can I) (?:read|calculate|interpret))\b/i
const definition = /^(?:please )?(?:define |what (?:is|are) (?:an? |the meaning of )|what does .+ mean\b|explain (?:the (?:idea|concept|meaning) of|how)\b)/i
const genericForecast = /^(?:what (?:is|are|does) (?:an? )?|(?:please )?(?:define|explain) (?:an? )?)(?:(?:analyst|stock|earnings|economic|price|market) )?(?:forecasts?|predictions?|projections?|outlooks?|targets?)(?: mean)?[. ]*$/i
const hypothetical = /\b(?:hypothetical(?:ly)?|suppose|what if|assuming)\b/i
const suppliedChange = /\b(?:if|assuming|suppose)\b.{0,80}\d+(?:\.\d+)?\s*(?:%|percent|basis points)/
const followUp = /^(?:(?:and|or)\s+|what about\b|how about\b|same (?:question|for)\b|(?:do|compare) (?:the same|that)\b)/i

function classify(question: string): SearchChoice {
  // A panel name is a location. “Summarize @news” does not ask for online news.
  question = question.replace(/@(?:news|pred(?:ictions?)?)\b|\b(?:the|my) (?:news|predictions?) (?:tab|panel|workspace)\b/gi, 'the panel')
  if (localOnly.test(question)) return 'none'
  const local = workspaceRef.test(question)
  const timely = freshness.test(question)
  const forward = outlook.test(question) || futureOutcome.test(question)
  if (searchRequest.test(question)) return 'required'
  if (externalEvidence.test(question)) return 'required'
  if (suppliedChange.test(question.toLowerCase()) && !forward && !/\b(?:actual|consensus|latest|news|current price)\b/i.test(question)) return 'none'
  if (shownInWorkspace.test(question) && !/\b(?:compare|versus|in light of|outlook for|against)\b/i.test(question)) return 'none'
  if (!timely && (methodology.test(question) || genericForecast.test(question))) return 'none'
  if (hypothetical.test(question) && !timely && !forward) return 'none'
  if (timely || forward) return 'required'
  if ((local && localReading.test(question)) || definition.test(question)) return 'none'
  return 'auto'
}

export function companionSearchChoice(messages: Turn[], forceWebSearch: boolean): SearchChoice {
  if (forceWebSearch) return 'required'
  const questions = messages.filter(message => message.role === 'user').map(message => message.content.trim())
  for (let i = questions.length - 1; i >= 0; i--) {
    const text = questions[i].replace(/[’]/g, "'")
    if (noWeb.test(text)) return i === questions.length - 1 ? 'none' : 'auto'
    // Assess distinct requests independently so "explain this chart and forecast X" still searches.
    const clauses = text.split(/[?;!\n]+|\b(?:and|but)\s+(?=(?:also |then )?(?:what|why|how|when|where|who|will|forecast|predict|compare|give|tell|find|search|check|explain)\b)/i).filter(Boolean)
    const choices = clauses.map(clause => classify(clause.trim()))
    if (choices.includes('required')) return 'required'
    if (choices.includes('none')) return i === questions.length - 1 && choices.every(choice => choice === 'none') ? 'none' : 'auto'
    if (!followUp.test(text) || text.length > 100) break
  }
  return 'auto'
}
