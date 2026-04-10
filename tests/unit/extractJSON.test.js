import { describe, test, expect } from 'vitest'
import { extractJSON } from '../../server/utils.js'

describe('extractJSON', () => {
  test('parses plain JSON', () => {
    const result = extractJSON('{"foo": 1}')
    expect(result).toEqual({ foo: 1 })
  })

  test('strips json code fences', () => {
    const result = extractJSON('```json\n{"bar": 2}\n```')
    expect(result).toEqual({ bar: 2 })
  })

  test('strips plain code fences', () => {
    const result = extractJSON('```\n{"baz": 3}\n```')
    expect(result).toEqual({ baz: 3 })
  })

  test('ignores preamble text before the fence', () => {
    const result = extractJSON('Here is the output:\n\n```json\n{"key": "value"}\n```')
    expect(result).toEqual({ key: 'value' })
  })

  test('handles nested objects', () => {
    const obj = { dimensions: { a: { score: 8, reasoning: 'good' } }, summary: 'ok' }
    expect(extractJSON(JSON.stringify(obj))).toEqual(obj)
  })

  test('throws on invalid JSON', () => {
    expect(() => extractJSON('not json at all')).toThrow()
  })

  test('extracts first JSON object when text follows', () => {
    const result = extractJSON('{"x": 1} trailing text here')
    expect(result).toEqual({ x: 1 })
  })
})
