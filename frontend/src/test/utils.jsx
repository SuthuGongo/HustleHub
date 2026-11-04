import { render, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export const clientUser = { id: 'c1', name: 'Aisha Naidoo', email: 'aisha@example.com', role: 'client' };
export const freelancerUser = { id: 'f1', name: 'Thabo Mokoena', email: 'thabo@example.com', role: 'freelancer' };
export const adminUser = { id: 'a1', name: 'Platform Admin', email: 'admin@example.com', role: 'admin' };

// Renders UI inside a router and a stubbed auth context, so tests control who is "logged in".
export function renderApp(ui, { route = '/', user = null, initialising = false, auth = {}, path, stub = true } = {}) {
  const uiPath = path ?? (typeof route === 'string' ? route : route.pathname).split('?')[0];
  const stubs = [
    ['/login', 'Login screen'],
    ['/register', 'Register screen'],
    ['/gigs', 'Gigs screen'],
    ['/my-gigs', 'My gigs screen'],
    ['/bookings', 'Bookings screen'],
    ['/admin', 'Admin screen'],
  ].filter(([stubPath]) => stub && stubPath !== uiPath);
  const value = {
    user,
    initialising,
    isAuthenticated: Boolean(user),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...auth,
  };
  return {
    auth: value,
    ...render(
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={uiPath} element={ui} />
            {stubs.map(([stubPath, text]) => (
              <Route key={stubPath} path={stubPath} element={<p>{text}</p>} />
            ))}
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    ),
  };
}

export const sampleGig = {
  id: 'g1',
  title: 'Logo &amp; brand identity design',
  description: 'I will design a memorable logo and a simple brand kit for your small business.',
  category: 'design',
  price: 450.5,
  deliveryDays: 5,
  isActive: true,
  ratingAvg: 4.8,
  ratingCount: 12,
  freelancer: { id: 'f1', name: 'Thabo Mokoena' },
};

export const sampleSeller = { id: 'f1', name: 'Thabo Mokoena', memberSince: '2026-08-20T10:00:00Z', activeGigs: 3, completedOrders: 7, ratingAvg: 4.8, ratingCount: 12 };

export const sampleReviews = {
  data: {
    reviews: [{ id: 'r1', rating: 5, comment: 'Brilliant work, &lt;b&gt;fast&lt;&#x2F;b&gt; and friendly.', createdAt: '2026-09-01T10:00:00Z', client: { id: 'c9', name: 'Aisha Naidoo' } }],
    summary: { average: 4.8, count: 12, distribution: { 5: 10, 4: 2, 3: 0, 2: 0, 1: 0 } },
  },
};

// Shows the current address, so tests can assert where the app navigated to.
// Full shape of GET /api/admin/stats, matching what the real backend returns.
export const sampleAdminStats = {
  data: {
    users: { total: 10, freelancers: 4, clients: 5, admins: 1, newThisWeek: 3 },
    gigs: { total: 6, active: 5, byCategory: { design: 3, development: 2, writing: 1 } },
    bookings: { total: 4, byStatus: { confirmed: 3, completed: 1 } },
    transactions: {
      count: 4,
      volume: 3200,
      currency: 'ZAR',
      trend: Array.from({ length: 14 }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, '0')}`,
        total: i === 13 ? 1200 : 0,
        count: i === 13 ? 1 : 0,
      })),
    },
    messages: { new: 2 },
    activity: [
      { kind: 'user', at: '2026-09-21T10:00:00Z', text: 'Aisha Naidoo joined as client' },
      { kind: 'booking', at: '2026-09-21T09:00:00Z', text: 'Aisha Naidoo booked "Logo design" from Thabo Mokoena (confirmed)' },
      { kind: 'message', at: '2026-09-21T08:00:00Z', text: 'Sam Visitor sent a message (account)' },
    ],
  },
};

// Types a code into the six-box code entry the real way: click the first box, then let the
// component's own auto-advance move focus box to box as each digit is typed (userEvent.keyboard with
// no explicit target always dispatches to document.activeElement, so this follows the focus changes
// reliably regardless of which userEvent version's `.type(el, text)` targeting quirks apply).
export async function typeCode(user, container, digits) {
  const boxes = within(container).getAllByRole('textbox');
  await user.click(boxes[0]);
  for (const digit of digits) {
    await user.keyboard(digit);
  }
}

export function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
