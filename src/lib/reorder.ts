export interface OrderItem {
  kind: 'folder' | 'project' | 'audio';
  id: string;
}

const same = (a: OrderItem, b: OrderItem) => a.kind === b.kind && a.id === b.id;

/**
 * Move `group` (which contains `dragged`) next to `target` as one contiguous block,
 * keeping the group's own on-screen order. The block lands after the target when
 * the dragged item started before it, and before it otherwise — the same rule a
 * single-item drag uses. Returns `order` unchanged if the move doesn't apply.
 */
export function moveBlockNextTo(
  order: OrderItem[],
  dragged: OrderItem,
  group: OrderItem[],
  target: OrderItem,
): OrderItem[] {
  if (group.some(g => same(g, target))) return order;
  const draggedIdx = order.findIndex(i => same(i, dragged));
  const targetIdx = order.findIndex(i => same(i, target));
  if (draggedIdx === -1 || targetIdx === -1) return order;

  const moving = order.filter(i => group.some(g => same(g, i)));
  const rest = order.filter(i => !moving.includes(i));
  const newTargetIdx = rest.findIndex(i => same(i, target));
  const insertAt = draggedIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
  return [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
}
