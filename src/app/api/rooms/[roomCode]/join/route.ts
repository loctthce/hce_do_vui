import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';

const joinSchema = z.object({
  playerName: z.string().min(1)
});

export async function POST(request: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Missing Supabase service role key.' }, { status: 500 });
  }

  const { roomCode } = await params;
  const parsed = joinSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id')
    .eq('room_code', roomCode)
    .maybeSingle();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('room_players')
    .upsert({ room_id: room.id, player_name: parsed.data.playerName }, { onConflict: 'room_id,player_name' })
    .select('id, player_name')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Unable to join room.' }, { status: 500 });
  }

  return NextResponse.json({ player: data });
}
