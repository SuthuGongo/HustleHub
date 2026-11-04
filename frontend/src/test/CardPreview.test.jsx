import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CardPreview from '../components/CardPreview';

describe('CardPreview', () => {
  it('shows placeholders when nothing has been typed yet', () => {
    render(<CardPreview number="" name="" expiry="" />);
    expect(screen.getByText('•••• •••• •••• ••••')).toBeInTheDocument();
    expect(screen.getByText('YOUR NAME')).toBeInTheDocument();
    expect(screen.getByText('MM/YY')).toBeInTheDocument();
  });

  it('reflects whatever has actually been typed', () => {
    render(<CardPreview number="4242 4242 4242 4242" name="aisha naidoo" expiry="12/34" />);
    expect(screen.getByText('4242 4242 4242 4242')).toBeInTheDocument();
    expect(screen.getByText('AISHA NAIDOO')).toBeInTheDocument(); // uppercased, like a real card
    expect(screen.getByText('12/34')).toBeInTheDocument();
  });
});
