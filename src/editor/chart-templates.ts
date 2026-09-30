export const CHART_TEMPLATES: { id: string; label: string; language: string; source: string }[] = [
  {
    id: "line",
    label: "Line chart",
    language: "chart",
    source: `type: line
x: x
y: y
data:
  - x: 1
    y: 2
  - x: 2
    y: 4
  - x: 3
    y: 3
`,
  },
  {
    id: "bar",
    label: "Bar chart",
    language: "chart",
    source: `type: bar
x: month
y: revenue
data:
  - month: Jan
    revenue: 10
  - month: Feb
    revenue: 17
  - month: Mar
    revenue: 13
`,
  },
  {
    id: "scatter",
    label: "Scatter chart",
    language: "chart",
    source: `type: scatter
x: x
y: y
data:
  - x: 1
    y: 2
  - x: 2
    y: 3.5
  - x: 4
    y: 3
`,
  },
  {
    id: "area",
    label: "Area chart",
    language: "chart",
    source: `type: area
x: x
y: y
data:
  - x: 0
    y: 1
  - x: 1
    y: 3
  - x: 2
    y: 2
`,
  },
  {
    id: "pie",
    label: "Pie chart",
    language: "chart",
    source: `type: pie
x: label
y: value
data:
  - label: A
    value: 4
  - label: B
    value: 7
  - label: C
    value: 2
`,
  },
  {
    id: "function",
    label: "Function chart",
    language: "chart",
    source: `type: function
x:
  min: 0
  max: 10
  step: 0.1
function: a * x + b
params:
  a:
    value: 2
    min: 0
    max: 5
    step: 0.1
  b:
    value: 0
    min: -5
    max: 5
    step: 0.1
`,
  },
];

export const CHART_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M4 19V5M4 19H20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M7 15L11 10L14 13L19 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
