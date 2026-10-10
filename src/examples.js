export const EXAMPLES = [
  {
    id: 'inverting-ring',
    name: 'Inverting ring',
    description: 'A three-variable feedback ring. The initial state visits a six-state periodic orbit; a second orbit has period 2.',
    variables: [
      { name: 'A', expression: '!C' },
      { name: 'B', expression: 'A' },
      { name: 'C', expression: 'B' },
    ],
    initialState: '000',
  },
  {
    id: 'fixed-cascade',
    name: 'Convergent cascade',
    description: 'A constant signal propagates through the network. Every initial configuration converges to the fixed point 111.',
    variables: [
      { name: 'A', expression: '1' },
      { name: 'B', expression: 'A' },
      { name: 'C', expression: 'B' },
    ],
    initialState: '000',
  },
  {
    id: 'multiple-attractors',
    name: 'Multiple attractors',
    description: 'A conserved switch controls two feedback variables. There are three fixed points, a period-2 orbit, and a four-state basin leading to 000.',
    variables: [
      { name: 'A', expression: 'A' },
      { name: 'B', expression: 'A && C' },
      { name: 'C', expression: 'B' },
    ],
    initialState: '010',
  },
];
