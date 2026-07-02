import { describe, it, expect } from 'vitest'
import { replaceLeaf } from '../src/renderer/components/SplitPane'
import type { SplitNode } from '../src/types'

function leaf(id: string): SplitNode {
  return { type: 'leaf', id }
}

function split(
  direction: 'horizontal' | 'vertical',
  child1: SplitNode,
  child2: SplitNode,
): SplitNode {
  return { type: 'split', direction, children: [child1, child2] }
}

describe('replaceLeaf', () => {
  it('should replace a matching leaf with a horizontal split', () => {
    const tree = leaf('root')
    const result = replaceLeaf(tree, 'root', 'horizontal')

    expect(result.type).toBe('split')
    if (result.type !== 'split') return
    expect(result.direction).toBe('horizontal')
    // Two new children
    expect(result.children[0].type).toBe('leaf')
    expect(result.children[1].type).toBe('leaf')
    // Children should have unique IDs
    if (result.children[0].type === 'leaf' && result.children[1].type === 'leaf') {
      expect(result.children[0].id).not.toBe(result.children[1].id)
    }
  })

  it('should replace a matching leaf with a vertical split', () => {
    const tree = leaf('root')
    const result = replaceLeaf(tree, 'root', 'vertical')

    expect(result.type).toBe('split')
    if (result.type !== 'split') return
    expect(result.direction).toBe('vertical')
  })

  it('should not replace a non-matching leaf', () => {
    const tree = leaf('target')
    const result = replaceLeaf(tree, 'other', 'horizontal')

    expect(result.type).toBe('leaf')
    if (result.type !== 'leaf') return
    expect(result.id).toBe('target')
  })

  it('should traverse branches to find the target leaf', () => {
    // Tree: root (horizontal) → [left (vertical → [A, B]), right (C)]
    const tree = split(
      'horizontal',
      split('vertical', leaf('A'), leaf('B')),
      leaf('C'),
    )

    // Replace leaf 'B' with a horizontal split
    const result = replaceLeaf(tree, 'B', 'horizontal')

    expect(result.type).toBe('split')
    if (result.type !== 'split') return

    // Left child should still be a vertical split
    expect(result.children[0].type).toBe('split')
    if (result.children[0].type !== 'split') return
    expect(result.children[0].direction).toBe('vertical')

    // The inner child 'A' should be unchanged
    expect(result.children[0].children[0].type).toBe('leaf')
    if (result.children[0].children[0].type !== 'leaf') return
    expect(result.children[0].children[0].id).toBe('A')

    // Leaf 'B' should now be a horizontal split
    expect(result.children[0].children[1].type).toBe('split')
    if (result.children[0].children[1].type !== 'split') return
    expect(result.children[0].children[1].direction).toBe('horizontal')

    // Right child 'C' should be unchanged
    expect(result.children[1].type).toBe('leaf')
    if (result.children[1].type !== 'leaf') return
    expect(result.children[1].id).toBe('C')
  })

  it('should return the node unchanged if targetId not found anywhere', () => {
    const tree = split('horizontal', leaf('A'), leaf('B'))
    const result = replaceLeaf(tree, 'Z', 'horizontal')
    expect(result).toEqual(tree)
  })

  it('should handle deep nesting correctly', () => {
    // Deep tree: H (V (H (A, B), C), D)
    const tree = split(
      'horizontal',
      split(
        'vertical',
        split('horizontal', leaf('A'), leaf('B')),
        leaf('C'),
      ),
      leaf('D'),
    )

    // Replace leaf 'D' at the deepest level
    const result = replaceLeaf(tree, 'D', 'vertical')

    expect(result.type).toBe('split')
    if (result.type !== 'split') return
    expect(result.children[1].type).toBe('split')
    if (result.children[1].type !== 'split') return
    expect(result.children[1].direction).toBe('vertical')
  })
})
