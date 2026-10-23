import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'Kill Switch', description: 'Deployment access controls' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
