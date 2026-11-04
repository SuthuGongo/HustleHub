import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GigForm from '../components/GigForm';
import { renderApp } from './utils';

async function fillValid(user) {
  await user.type(screen.getByLabelText('Title'), 'Logo design');
  await user.type(screen.getByLabelText('Description'), 'A clear description that is long enough to pass.');
  await user.selectOptions(screen.getByLabelText('Category'), 'design');
  await user.type(screen.getByLabelText('Price (rand)'), '450.50');
  await user.type(screen.getByLabelText('Delivery time (days)'), '5');
}

describe('GigForm', () => {
  it('blocks submission and explains every problem', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderApp(<GigForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Create gig' }));

    expect(screen.getByText('Title must be 5 to 100 characters.')).toBeInTheDocument();
    expect(screen.getByText('Description must be 20 to 2000 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(screen.getByText(/at most two decimals/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits clean, correctly typed values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderApp(<GigForm onSubmit={onSubmit} />);

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create gig' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Logo design',
      description: 'A clear description that is long enough to pass.',
      category: 'design',
      price: 450.5,
      deliveryDays: 5,
    });
  });

  it('pre-fills values when editing and shows server errors', () => {
    renderApp(
      <GigForm
        initial={{ title: 'Existing gig', description: 'Existing description that is long enough.', category: 'writing', price: '99', deliveryDays: '2' }}
        submitLabel="Save changes"
        serverError="You do not have permission to modify this gig."
        onSubmit={() => {}}
      />
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Existing gig');
    expect(screen.getByRole('alert')).toHaveTextContent('permission');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });
});
