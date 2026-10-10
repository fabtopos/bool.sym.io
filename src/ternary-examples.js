export const TERNARY_EXAMPLES = [
  {
    id: 'ternary-cycle',
    name: 'Three-state clock',
    description: 'A cycles through 0, 1 and 2 while B follows its previous value. All nine configurations lead to one period-3 orbit.',
    variables: [
      { name: 'A', expression: 'A + 1' },
      { name: 'B', expression: 'A' },
    ],
    initialState: '00',
  },
  {
    id: 'ternary-cascade',
    name: 'Convergent cascade',
    description: 'A constant high signal propagates through the network. All 27 configurations converge to the fixed point 222.',
    variables: [
      { name: 'A', expression: '2' },
      { name: 'B', expression: 'A' },
      { name: 'C', expression: 'B' },
    ],
    initialState: '000',
  },
  {
    id: 'ternary-multiple',
    name: 'Multiple attractors',
    description: 'A conserved level multiplies B modulo 3. Five fixed points and one period-2 orbit partition the nine configurations; all states with A = 0 converge to 00.',
    variables: [
      { name: 'A', expression: 'A' },
      { name: 'B', expression: 'A * B' },
    ],
    initialState: '02',
  },
];
