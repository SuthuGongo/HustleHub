import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import Avatar, { initialsOf } from '../components/Avatar';
import { StarInput, Stars } from '../components/StarRating';

describe('Stars (read-only)', () => {
  it('describes the rating in words for screen readers', () => {
    render(<Stars value={4.6} count={12} />);
    expect(screen.getByRole('img', { name: 'Rated 4.6 out of 5, 12 reviews' })).toBeInTheDocument();
    expect(screen.getByText('4.6')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
  });

  it('fills to the nearest half star', () => {
    const { container, rerender } = render(<Stars value={4.6} count={1} />);
    expect(container.querySelector('.stars-fill')).toHaveClass('r9'); // 4.5 stars
    rerender(<Stars value={3.2} count={1} />);
    expect(container.querySelector('.stars-fill')).toHaveClass('r6'); // 3 stars
    rerender(<Stars value={5} count={1} />);
    expect(container.querySelector('.stars-fill')).toHaveClass('r10');
  });

  it('shows "New" instead of empty stars when nobody has rated yet', () => {
    const { container } = render(<Stars value={0} count={0} />);
    expect(screen.getByRole('img', { name: 'No ratings yet' })).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(container.querySelector('.stars')).toBeNull(); // no row of empty stars either
  });

  it('uses the singular for one review', () => {
    render(<Stars value={5} count={1} />);
    expect(screen.getByRole('img', { name: 'Rated 5.0 out of 5, 1 review' })).toBeInTheDocument();
  });
});

describe('StarInput', () => {
  function Harness() {
    const [value, setValue] = useState(0);
    return <StarInput value={value} onChange={setValue} />;
  }

  it('is a radio group with five options, none chosen at first', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Your rating' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    radios.forEach((r) => expect(r).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText('Choose a rating')).toBeInTheDocument();
  });

  it('selects a rating and names it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: '4 stars: Very good' }));
    expect(screen.getByRole('radio', { name: '4 stars: Very good' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '5 stars: Excellent' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Very good')).toBeInTheDocument();
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('radio', { name: '1 star: Poor' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Avatar', () => {
  it('builds initials from the first two words, decoding escaped characters', () => {
    expect(initialsOf('Thabo Mokoena')).toBe('TM');
    expect(initialsOf('lerato')).toBe('L');
    expect(initialsOf('   ')).toBe('?');
    const { container } = render(<Avatar name="O&#x27;Brien &amp; Sons" />);
    expect(container.textContent).toBe('OS');
  });

  it('gives the same person the same colour every time', () => {
    const a = render(<Avatar name="Aisha Naidoo" />).container.firstChild.getAttribute('data-tone');
    const b = render(<Avatar name="Aisha Naidoo" />).container.firstChild.getAttribute('data-tone');
    expect(a).toBe(b);
  });

  it('is hidden from screen readers because the name is always next to it', () => {
    const { container } = render(<Avatar name="Aisha Naidoo" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
