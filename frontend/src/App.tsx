import { useEffect, useState, type FormEvent } from 'react';
import { api, type AnalyticsOverview, type Notification, type Ticket } from './services/api';
import { createSocket } from './services/socket';

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('accessToken') || '');
  const [role, setRole] = useState(() => localStorage.getItem('userRole') || '');
  const [userId, setUserId] = useState(() => localStorage.getItem('userId') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Ticket['priority']>('MEDIUM');
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);

  useEffect(() => {
    if (!token) return;

    let active = true;
    api.notifications(token)
      .then((notificationResponse) => active && setNotifications(notificationResponse.notifications))
      .catch((requestError: Error) => active && setError(requestError.message));

    api.tickets(token, role)
      .then((ticketResponse) => active && setTickets(ticketResponse.tickets))
      .catch((requestError: Error) => active && setError(requestError.message));
    if (role === 'ADMIN' || role === 'AGENT') {
      api.analytics(token)
        .then((analyticsResponse) => active && setOverview(analyticsResponse.overview))
        .catch((requestError: Error) => active && setError(requestError.message));
    }

    const socket = createSocket(token);
    socket.on('notification', (event) => {
      setNotifications((current) => [
        {
          id: `realtime-${Date.now()}`,
          type: event.type,
          payload: { message: event.message, resourceId: event.resourceId },
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [token, role]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoggingIn(true);

    try {
      const response = await api.login(email.trim(), password);
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('userRole', response.user.role);
      localStorage.setItem('userId', response.user.id);
      setToken(response.accessToken);
      setRole(response.user.role);
      setUserId(response.user.id);
      setPassword('');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in');
    } finally {
      setIsLoggingIn(false);
    }
  }

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    setToken('');
    setRole('');
    setUserId('');
    setOverview(null);
    setNotifications([]);
    setTickets([]);
  }

  async function markAllRead() {
    if (!token) return;
    await api.markAllNotificationsRead(token);
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!token) return;
      setError('');
      setIsCreatingTicket(true);
      try {
        const { conversation } = await api.createConversation(token);
        const response = await api.createTicket(token, { conversationId: conversation.id, subject, description, priority });
        setTickets((current) => [response.ticket, ...current]);
        setSubject('');
        setDescription('');
        setPriority('MEDIUM');
      } catch (ticketError) {
        setError(ticketError instanceof Error ? ticketError.message : 'Unable to create ticket');
      } finally {
        setIsCreatingTicket(false);
      }
  }

    async function updateStatus(ticketId: string, status: Ticket['status']) {
      if (!token) return;
      try {
        const response = await api.updateTicketStatus(token, ticketId, status);
        setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? response.ticket : ticket)));
      } catch (statusError) {
        setError(statusError instanceof Error ? statusError.message : 'Unable to update ticket');
      }
  }

    async function assignToMe(ticketId: string) {
      if (!token || !userId) return;
      try {
        await api.assignTicket(token, ticketId, userId);
        setError('');
      } catch (assignmentError) {
        setError(assignmentError instanceof Error ? assignmentError.message : 'Unable to assign ticket');
      }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Support operations</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Command center</h1>
          </div>
          {token ? (
            <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400" onClick={logout}>
              Sign out
            </button>
          ) : (
            <form className="flex flex-wrap justify-end gap-2" onSubmit={login}>
              <input
                aria-label="Email"
                className="w-52 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                aria-label="Password"
                className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60" disabled={isLoggingIn} type="submit">
                {isLoggingIn ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}
        </header>

        {error && <p className="mb-6 rounded-lg border border-rose-400/40 bg-rose-400/10 p-4 text-rose-200">{error}</p>}
        {!token && <p className="mb-6 text-slate-400">Sign in to load live operations data.</p>}
        {token && role === 'CUSTOMER' && <p className="mb-6 text-slate-400">Signed in as a customer. Notifications are available; operations analytics require an agent account.</p>}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Conversations" value={overview?.conversations ?? '-'} />
          <Metric label="Resolved by AI" value={overview ? `${Math.round(overview.aiResolutionRate * 100)}%` : '-'} />
          <Metric label="AI resolutions" value={overview?.resolvedByAI ?? '-'} />
          <Metric label="Unread notifications" value={overview?.unreadNotifications ?? notifications.filter((item) => !item.read).length} />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {role === 'CUSTOMER' && (
            <form className="rounded-xl border border-cyan-400/30 bg-slate-900/70 p-5 lg:col-span-2" onSubmit={createTicket}>
              <h2 className="text-lg font-semibold">Create a support ticket</h2>
              <p className="mt-1 text-sm text-slate-400">Describe the issue and our support team will pick it up.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px]">
                <input className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400" placeholder="What do you need help with?" value={subject} onChange={(event) => setSubject(event.target.value)} required />
                <select className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400" value={priority} onChange={(event) => setPriority(event.target.value as Ticket['priority'])}>
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <textarea className="mt-3 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400" placeholder="Add details (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
              <button className="mt-3 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60" disabled={isCreatingTicket} type="submit">{isCreatingTicket ? 'Creating...' : 'Create ticket'}</button>
            </form>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="text-lg font-semibold">{role === 'CUSTOMER' ? 'Your tickets' : 'Assigned ticket queue'}</h2><p className="mt-1 text-sm text-slate-500">{tickets.length} ticket{tickets.length === 1 ? '' : 's'}</p></div>
            </div>
            <div className="space-y-3">
              {tickets.length === 0 && <p className="text-sm text-slate-500">No tickets yet.</p>}
              {tickets.map((ticket) => (
                <article className="rounded-lg border border-slate-800 bg-slate-950/60 p-4" key={ticket.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{ticket.subject}</h3><p className="mt-1 text-sm text-slate-400">{ticket.description || 'No description provided.'}</p></div><span className="rounded-full border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200">{ticket.priority}</span></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>Created {new Date(ticket.createdAt).toLocaleString()}</span><span className="text-slate-700">|</span><span>{ticket.status.replace('_', ' ')}</span>{role !== 'CUSTOMER' && <><button className="ml-auto rounded border border-slate-700 px-2 py-1 text-slate-300 hover:border-cyan-400" onClick={() => assignToMe(ticket.id)}>Assign to me</button><select className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300" value={ticket.status} onChange={(event) => updateStatus(ticket.id, event.target.value as Ticket['status'])}>{(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((item) => <option key={item}>{item}</option>)}</select></>}</div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Notifications</h2><button className="text-sm text-cyan-300 hover:text-cyan-200" onClick={markAllRead} disabled={!token}>Mark all read</button></div>
            <div className="space-y-3">{notifications.length === 0 && <p className="text-sm text-slate-500">No notifications yet.</p>}{notifications.slice(0, 8).map((notification) => <article className={`border-l-2 px-3 py-2 ${notification.read ? 'border-slate-700' : 'border-cyan-300'}`} key={notification.id}><p className="text-sm">{notification.payload.message || notification.type}</p><p className="mt-1 text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString()}</p></article>)}</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-semibold">Ticket analytics</h2><div className="mt-4 space-y-3">{overview?.ticketsByStatus.map((item) => <div className="flex items-center justify-between text-sm" key={item.status}><span className="text-slate-400">{item.status.replace('_', ' ')}</span><span className="font-semibold">{item._count._all}</span></div>) || <p className="text-sm text-slate-500">Analytics appear for agents and admins.</p>}</div></div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-cyan-200">{value}</p>
    </div>
  );
}

export default App
