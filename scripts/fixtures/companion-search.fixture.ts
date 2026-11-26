import { strictEqual } from 'node:assert';
import { companionSearchChoice } from '../../server/companionSearch';

const examples = {
  required: [
    'Predictions for MSFT?',
    'What is the price target for Tesla?',
    'What happened to the pound today?',
    'When is the next Fed meeting?',
    'Explain this chart in light of today’s Fed decision.',
    'Looking at this chart, what are analysts forecasting for MSFT?',
    'What does this chart mean for NVDA’s next-quarter outlook?',
    'Explain this graph and forecast NVDA earnings.',
    'What caused the drop shown in this graph?',
    'Only use official sources to forecast interest rates.',
  ],
  none: [
    'Explain the chart I am looking at.',
    'How do analysts forecast earnings?',
    'What is a stock forecast?',
    'What does a price target mean?',
    'What is a moving average?',
    'Summarize @news.',
    'What are the predictions shown here?',
    'Which of the forecasts listed on this screen has the highest probability?',
    'Using only my chart, explain its outlook.',
    'If our holdings fall 5% next week, how much would we lose?',
  ],
  auto: ['Tell me about MSFT.', 'Compare Apple and Samsung.'],
} as const;
const ask = (text: string) => ({ role: 'user', content: text });
for (const [mode, questions] of Object.entries(examples)) {
  for (const question of questions) strictEqual(companionSearchChoice([ask(question)], false), mode, question);
}
const forecast = [ask('Forecast NVDA next quarter.'), { role: 'assistant', content: 'Some scenarios.' }];
strictEqual(companionSearchChoice([...forecast, ask('And MSFT?'), ask('How about AAPL?')], false), 'required');
strictEqual(companionSearchChoice([...forecast, ask('Explain this chart.')], false), 'none');
strictEqual(companionSearchChoice([...forecast, ask('What else is in my feed?')], false), 'none');
strictEqual(companionSearchChoice([ask('Explain the chart.')], true), 'required');
console.log('Companion source routing handles forecasts, screen readings, general questions, mixed requests and follow-ups');
