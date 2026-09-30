import { describe, expect, it } from 'vitest';
import { moveBlockNextTo, type OrderItem } from '../reorder';

const p = (id: string): OrderItem => ({ kind: 'project', id });
const a = (id: string): OrderItem => ({ kind: 'audio', id });
const ids = (o: OrderItem[]) => o.map(i => `${i.kind[0]}${i.id}`).join(' ');

describe('moveBlockNextTo', () => {
  const order = [p('1'), p('2'), a('3'), p('4'), p('5')];

  it('moves a single item after a later target', () => {
    expect(ids(moveBlockNextTo(order, p('1'), [p('1')], p('4')))).toBe('p2 a3 p4 p1 p5');
  });

  it('moves a single item before an earlier target', () => {
    expect(ids(moveBlockNextTo(order, p('5'), [p('5')], p('2')))).toBe('p1 p5 p2 a3 p4');
  });

  it('moves a multi-selection as one block, keeping its order, after a later target', () => {
    const group = [p('1'), a('3')];
    expect(ids(moveBlockNextTo(order, p('1'), group, p('5')))).toBe('p2 p4 p5 p1 a3');
  });

  it('moves a multi-selection before an earlier target', () => {
    const group = [a('3'), p('5')];
    expect(ids(moveBlockNextTo(order, p('5'), group, p('1')))).toBe('a3 p5 p1 p2 p4');
  });

  it('gathers a scattered selection into one block regardless of which member is grabbed', () => {
    const group = [p('2'), p('4')];
    expect(ids(moveBlockNextTo(order, p('4'), group, p('1')))).toBe('p2 p4 p1 a3 p5');
  });

  it('ignores a target that is part of the group, or missing', () => {
    const group = [p('1'), p('2')];
    expect(moveBlockNextTo(order, p('1'), group, p('2'))).toBe(order);
    expect(moveBlockNextTo(order, p('1'), group, p('99'))).toBe(order);
  });
});
