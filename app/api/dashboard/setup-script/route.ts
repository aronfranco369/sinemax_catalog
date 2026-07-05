import { NextResponse } from 'next/server'
import { buildSetupScript } from '@/lib/transferScript'

export async function GET() {
  return NextResponse.json({ script: buildSetupScript() })
}
