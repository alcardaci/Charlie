import { memo } from 'react';
import Markdown, { type MarkdownToJSX } from 'markdown-to-jsx';
import { CompanionLink } from './CompanionLink';
import './CompanionAnswer.css';

const options: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  disableFrontmatter: true,
  forceBlock: true,
  wrapper: null,
  overrides: {
    a: CompanionLink,
    img: ({ alt }: { alt?: string }) => <>{alt}</>,
  },
};

export const CompanionAnswer = memo(function CompanionAnswer({ text }: { text: string }) {
  return <div className="companion-answer"><Markdown options={options}>{text}</Markdown></div>;
});
