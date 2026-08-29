export default async function PlayPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const { PlayRoomClient } = await import('@/components/play-room-client');

  return <PlayRoomClient roomCode={roomCode} />;
}
