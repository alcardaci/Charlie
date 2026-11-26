import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompanionAnswer } from '../../src/components/CompanionAnswer';
import { CompanionLink } from '../../src/components/CompanionLink';

const render = (text: string) => renderToStaticMarkup(<CompanionAnswer text={text} />);
const url = 'https://example.test/filings/' + 'a'.repeat(240);
const answer = render(`**Volatility** and _breadth_.\n\nRead [**the release**](${url}) or ${url}.\n\n\`*price*\` and 2 * 3.`);
assert.ok(answer.includes('<strong>Volatility</strong>') && answer.includes('<em>breadth</em>'));
assert.equal(answer.split(`href="${url}"`).length - 1, 2, 'named and bare URLs stay whole');
assert.ok(answer.includes('<strong>the release</strong></a>') && answer.includes('<code>*price*</code> and 2 * 3.'));
const literal = render('![Chart](https://example.test/image.png) <img src="https://example.test/pixel.png"> [open](file:///local) <script>script</script>');
assert.ok(!/<(?:img|script)\b/i.test(literal) && !literal.includes('href="file:'));
assert.equal(renderToStaticMarkup(<CompanionLink href="custom-scheme:open">source</CompanionLink>), 'source');
console.log('Companion answer checks passed for emphasis, literal text, links and inert markup.');
