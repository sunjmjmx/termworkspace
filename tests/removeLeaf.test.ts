import { describe, it, expect } from 'vitest'
import { removeLeaf, countLeaves } from '../src/renderer/components/SplitPane'
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

/** Narrow a SplitNode | null into SplitNode, failing the test if null. */
function expectNonNull(r: SplitNode | null): asserts r is SplitNode {
  expect(r).not.toBeNull()
}

function asLeaf(n: SplitNode): { type: 'leaf'; id: string } {
  expect(n.type).toBe('leaf')
  return n as { type: 'leaf'; id: string }
}

function asSplit(n: SplitNode): { type: 'split'; direction: string; children: [SplitNode, SplitNode] } {
  expect(n.type).toBe('split')
  return n as { type: 'split'; direction: string; children: [SplitNode, SplitNode] }
}

describe('countLeaves', () => {
  it('should return 1 for a single leaf', () => {
    expect(countLeaves(leaf('A'))).toBe(1)
  })

  it('should count leaves in a split tree', () => {
    const tree = split('horizontal', leaf('A'), leaf('B'))
    expect(countLeaves(tree)).toBe(2)
  })

  it('should count leaves in a deeply nested tree', () => {
    const tree = split(
      'horizontal',
      split('vertical', leaf('A'), split('horizontal', leaf('B'), leaf('C'))),
      leaf('D'),
    )
    expect(countLeaves(tree)).toBe(4)
  })
})

describe('removeLeaf', () => {
  it('should return null when removing the only leaf', () => {
    const tree = leaf('only')
    expect(removeLeaf(tree, 'only')).toBeNull()
  })

  it('should flatten to the surviving leaf when removing one of two', () => {
    const tree = split('horizontal', leaf('A'), leaf('B'))

    const result = removeLeaf(tree, 'A')
    expectNonNull(result)
    const r1 = asLeaf(result)
    expect(r1.id).toBe('B')
  })

  it('should flatten to the surviving leaf (remove the other one)', () => {
    const tree = split('horizontal', leaf('A'), leaf('B'))

    const result = removeLeaf(tree, 'B')
    expectNonNull(result)
    const r2 = asLeaf(result)
    expect(r2.id).toBe('A')
  })

  it('should not change tree when removing a non-matching leaf', () => {
    const tree = split('horizontal', leaf('A'), leaf('B'))
    const result = removeLeaf(tree, 'Z')
    expect(result).toBe(tree)
  })

  it('should flatten recursively when removal causes collapse', () => {
    // Nested: H ( V (A, B), C )
    // Remove A → V collapses (B promoted) → H (B, C) stays as H
    const tree = split(
      'horizontal',
      split('vertical', leaf('A'), leaf('B')),
      leaf('C'),
    )

    const result = removeLeaf(tree, 'A')
    expectNonNull(result)
    const r1 = asSplit(result)
    expect(r1.direction).toBe('horizontal')
    // Left child should now be leaf B (flattened from the V split)
    const left = asLeaf(r1.children[0])
    expect(left.id).toBe('B')
    // Right child stays C
    const right = asLeaf(r1.children[1])
    expect(right.id).toBe('C')
  })

  it('should flatten the root when removal leaves one child', () => {
    // H (A, V (B, C))
    // Remove A → root H has only V(B,C) → flatten to V(B,C)
    const tree = split(
      'horizontal',
      leaf('A'),
      split('vertical', leaf('B'), leaf('C')),
    )

    const result = removeLeaf(tree, 'A')
    expectNonNull(result)
    // Root flattened: the result should be V(B,C) not H(V(B,C))
    const r1 = asSplit(result)
    expect(r1.direction).toBe('vertical')
    const left = asLeaf(r1.children[0])
    expect(left.id).toBe('B')
    const right = asLeaf(r1.children[1])
    expect(right.id).toBe('C')
  })

  it('should handle deeply nested removal correctly', () => {
    // Deep tree: H ( V ( H (A, B), C ), D )
    const tree = split(
      'horizontal',
      split(
        'vertical',
        split('horizontal', leaf('A'), leaf('B')),
        leaf('C'),
      ),
      leaf('D'),
    )

    // Remove B → the innermost H(A,B) collapses to A
    // Result: H ( V (A, C), D )
    const result = removeLeaf(tree, 'B')
    expectNonNull(result)
    const r1 = asSplit(result)
    expect(r1.direction).toBe('horizontal')

    // Left child should be V(A, C)
    const leftBranch = asSplit(r1.children[0])
    expect(leftBranch.direction).toBe('vertical')
    // V's left child is A (flattened)
    const leftLeaf = asLeaf(leftBranch.children[0])
    expect(leftLeaf.id).toBe('A')
    // V's right child is C
    const rightLeaf = asLeaf(leftBranch.children[1])
    expect(rightLeaf.id).toBe('C')

    // Right child is D
    const right = asLeaf(r1.children[1])
    expect(right.id).toBe('D')
  })

  it('should return original tree if targetId not found anywhere', () => {
    const tree = split('horizontal', leaf('A'), leaf('B'))
    const result = removeLeaf(tree, 'NOT_EXIST')
    expect(result).toBe(tree)
  })

  it('should return original tree when removing from a single leaf with wrong id', () => {
    const tree = leaf('A')
    const result = removeLeaf(tree, 'B')
    expect(result).toBe(tree)
  })
})
