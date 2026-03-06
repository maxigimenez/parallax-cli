const STEPS = [
  {
    title: 'Pull tickets',
    body: 'Collect prioritized work from Linear or GitHub queues with your configured filters.'
  },
  {
    title: 'Launch AI model',
    body: 'Run Codex or Gemini in an isolated task workspace with plan-first execution.'
  },
  {
    title: 'Open PR',
    body: 'Push implementation branches and open pull requests with clear diffs and context.'
  },
  {
    title: 'Iterate on PR',
    body: 'Apply review feedback and re-run execution loops until the PR is merge-ready.'
  }
];

function StepCard({ title, body, index }: { title: string; body: string; index: number }) {
  return (
    <div className="rounded-lg border border-white/12 bg-white/[0.02] p-5">
      <div className="mb-3 inline-flex h-7 min-w-7 items-center justify-center rounded border border-white/15 bg-white/[0.04] px-2 text-xs font-medium text-white/72">
        {String(index + 1).padStart(2, '0')}
      </div>
      <h3 className="mb-2 text-base font-semibold tracking-tight text-white/92">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

export function WorkflowDiagram() {
  return (
    <div className="space-y-4">
      <div className="hidden items-stretch gap-4 md:flex">
        {STEPS.map((step, index) => (
          <div key={step.title} className="flex flex-1 items-center gap-4">
            <StepCard index={index} title={step.title} body={step.body} />
            {index < STEPS.length - 1 ? (
              <div className="flex w-20 items-center">
                <div className="arrow-line-horizontal" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-3 md:hidden">
        {STEPS.map((step, index) => (
          <div key={step.title}>
            <StepCard index={index} title={step.title} body={step.body} />
            {index < STEPS.length - 1 ? (
              <div className="my-2 h-8">
                <div className="arrow-line-vertical h-full" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
