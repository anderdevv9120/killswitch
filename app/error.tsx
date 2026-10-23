'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="error-shell panel"><p className="eyebrow">TEMPORARILY UNAVAILABLE</p><h1>Could not load this page.</h1><p className="muted">Please try again in a moment.</p><button onClick={reset} type="button">Try again</button></main>
}
