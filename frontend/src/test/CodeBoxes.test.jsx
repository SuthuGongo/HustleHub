import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import CodeBoxes from '../components/CodeBoxes';

function Harness({ length = 6 }) {
  const [value, setValue] = useState('');
  return (
    <>
      <CodeBoxes length={length} value={value} onChange={setValue} />
      <p data-testid="value">{value}</p>
    </>
  );
}

const boxes = (container) => within(container.querySelector('.code-boxes')).getAllByRole('textbox');

describe('CodeBoxes', () => {
  it('renders one box per digit, each with its own accessible name, inside a named group', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Verification code' });
    const inputs = within(group).getAllByRole('textbox');
    expect(inputs).toHaveLength(6);
    expect(inputs[0]).toHaveAccessibleName('Digit 1 of 6');
    expect(inputs[5]).toHaveAccessibleName('Digit 6 of 6');
  });

  it('typing a digit moves focus to the next box automatically', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const [b0, b1, b2] = boxes(container);
    await user.click(b0);
    await user.keyboard('1');
    expect(b0).toHaveValue('1');
    expect(b1).toHaveFocus();
    await user.keyboard('2');
    expect(b1).toHaveValue('2');
    expect(b2).toHaveFocus();
  });

  it('does not move focus past the last box', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const list = boxes(container);
    await user.click(list[5]);
    await user.keyboard('9');
    expect(list[5]).toHaveValue('9');
    expect(list[5]).toHaveFocus(); // nowhere further to go
  });

  it('backspace on an empty box jumps back and clears the previous box', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const [b0, b1] = boxes(container);
    await user.click(b0);
    await user.keyboard('7'); // -> b1 focused, b0="7"
    expect(b1).toHaveFocus();
    await user.keyboard('{Backspace}'); // b1 is empty, so this jumps back and clears b0
    expect(b0).toHaveFocus();
    expect(b0).toHaveValue('');
  });

  it('backspace on a filled box just clears it, without moving focus', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const list = boxes(container);
    await user.type(list[2], '5');
    await user.keyboard('{Backspace}');
    expect(list[2]).toHaveValue('');
    expect(list[2]).toHaveFocus();
  });

  it('arrow keys move between boxes without changing their values', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const [b0, b1] = boxes(container);
    await user.click(b1);
    await user.keyboard('{ArrowLeft}');
    expect(b0).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(b1).toHaveFocus();
  });

  it('pasting a full code fills every box and focuses the last one', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const list = boxes(container);
    await user.click(list[0]);
    await user.paste('123456');
    expect(list.map((b) => b.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(list[5]).toHaveFocus();
    expect(screen.getByTestId('value')).toHaveTextContent('123456');
  });

  it('pasting non-digit characters (e.g. dashes from a copied code) strips them', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const list = boxes(container);
    await user.click(list[0]);
    await user.paste('12-34-56');
    expect(list.map((b) => b.value)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('a paste landing partway through still fills forward from that box', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const list = boxes(container);
    await user.type(list[0], '9');
    await user.click(list[2]);
    await user.paste('345');
    expect(list.map((b) => b.value)).toEqual(['9', '', '3', '4', '5', '']);
  });

  it('disabled boxes cannot be typed into', () => {
    render(<CodeBoxes value="" onChange={() => {}} disabled />);
    screen.getAllByRole('textbox').forEach((b) => expect(b).toBeDisabled());
  });
});
