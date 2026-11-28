import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { earningsQuestionsQuery } from '../api/earningsCalls';
import type { EarningsCallEvent, EarningsCallParticipant, EarningsCallQuestion } from '../types/earningsCalls';
import { Loading, ReadError, timestamp } from './EarningsCallReadState';
import { TranscriptExchange, type TranscriptRange } from './EarningsCallTranscript';

function participant(person: EarningsCallParticipant) {
  return [...new Set([person.name, person.role].filter(Boolean))].join(' · ');
}

function sourceRange(question: EarningsCallQuestion, total: number | null): TranscriptRange | null {
  const { startTurnIndex: start, endTurnIndex: end } = question;
  if (start == null || end == null || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end <= start || (total !== null && end > total)) return null;
  return { start, end, totalTurnCount: total };
}

export function AnalystQuestions({ call, onOpenTranscript }: {
  call: EarningsCallEvent; onOpenTranscript: (range: TranscriptRange) => void;
}) {
  const query = useQuery(earningsQuestionsQuery(call.id));
  const [expanded, setExpanded] = useState<number | null>(null);
  const sectionId = useId();
  const page = query.data;
  return <section aria-label="Analyst questions and answers" className="space-y-3">
    {query.isPending && <Loading>Loading analyst questions…</Loading>}
    {query.error && <ReadError error={query.error} retry={() => void query.refetch()} />}
    {page?.stale && <p role="status" className="text-xs text-terminal-muted">{page.notice || 'Showing cached analyst questions.'}</p>}
    {page?.isFiledRecord && <p className="text-xs text-terminal-muted">Questions from the company-filed call summary.</p>}
    {page && !page.data.length && <p role="status" className="text-sm text-terminal-muted">{page.note || 'Equibles has no structured Q&A for this call.'}</p>}
    {page && page.data.length > 0 && <ol className="divide-y divide-terminal-border">
      {page.data.map((question, index) => {
        const range = call.hasTranscript ? sourceRange(question, page.totalTurnCount) : null;
        const answerers = question.answerers.map(participant).filter(Boolean);
        const analyst = question.analyst.name || question.analyst.role || 'Analyst unidentified';
        const sourceTime = [timestamp(question.startSeconds), timestamp(question.endSeconds)].filter(Boolean).join('–');
        const label = 'Question ' + (question.number ?? index + 1);
        const exchangeId = sectionId + '-exchange-' + index;
        return <li key={index} className="space-y-2 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="instrument-heading text-xs text-terminal-accent">{label}</h4>
            <span className="text-sm font-semibold text-terminal-text">{analyst}</span>
            {question.firm?.name && <span className="text-xs text-terminal-muted">{question.firm.name}</span>}
            {sourceTime && <span className="text-xs tabular-nums text-terminal-faint">
              {question.startSeconds == null ? 'Ends at ' : ''}{sourceTime}
            </span>}
          </div>
          {question.question && <p className="max-w-[100ch] whitespace-pre-line break-words text-sm leading-relaxed">{question.question}</p>}
          {answerers.length > 0 && <p className="text-xs text-terminal-muted">Responding · <span className="text-terminal-text">{answerers.join(', ')}</span></p>}
          {range ? <>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <button type="button" aria-expanded={expanded === index} aria-controls={exchangeId} className="text-terminal-accent hover:underline"
                onClick={() => setExpanded(expanded === index ? null : index)}>{expanded === index ? 'Hide answer' : 'Read answer'}</button>
              <button type="button" className="text-terminal-accent underline underline-offset-2" onClick={() => onOpenTranscript(range)}>
                Open in transcript
              </button>
            </div>
            {expanded === index && <div id={exchangeId} className="border-l-2 border-terminal-border pl-3">
              <TranscriptExchange eventId={call.id} range={range} />
            </div>}
          </> : <p className="text-xs text-terminal-faint">The transcript section for this exchange is unavailable.</p>}
        </li>;
      })}
    </ol>}
  </section>;
}
