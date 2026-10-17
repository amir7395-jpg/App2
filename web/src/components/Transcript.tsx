export function Transcript({ messages }: { messages: { id?: string; role: string; content: string }[] }) {
  if (messages.length === 0) return <p className="muted">No transcript.</p>;
  return (
    <div className="transcript">
      {messages.map((m, i) => (
        <div key={m.id ?? i} className={`bubble ${m.role}`}>
          {m.role === "event" ? `• ${m.content}` : m.content}
        </div>
      ))}
    </div>
  );
}
