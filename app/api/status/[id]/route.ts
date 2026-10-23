import { getSwitchStatus, isSwitchId } from '../../../../lib/switches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  try {
    const { id } = await context.params
    if (!isSwitchId(id)) return Response.json({ error: 'Invalid switch ID' }, { status: 400, headers })
    const disabled = await getSwitchStatus(id)
    if (disabled === null) return Response.json({ error: 'Switch not found' }, { status: 404, headers })
    return Response.json({ disabled }, { headers })
  } catch {
    return Response.json({ error: 'Status temporarily unavailable' }, { status: 503, headers })
  }
}
