# Energia i pomiary

Notatka z **wynikami eksperymentu**, *obserwacjami* i kodem. Jednostka pomiaru: `kWh`.

## Porównanie dni

```vega-lite
{
  "width": "container", "height": 150,
  "data": {"values": [
    {"dzień": "Pon", "energia": 12},
    {"dzień": "Wt", "energia": 19},
    {"dzień": "Śr", "energia": 15},
    {"dzień": "Czw", "energia": 24},
    {"dzień": "Pt", "energia": 21}
  ]},
  "mark": {"type": "bar", "color": "#7093c1", "cornerRadiusTopLeft": 3, "cornerRadiusTopRight": 3},
  "encoding": {
    "x": {"field": "dzień", "type": "ordinal", "sort": ["Pon", "Wt", "Śr", "Czw", "Pt"], "axis": {"title": null, "labelAngle": 0}},
    "y": {"field": "energia", "type": "quantitative", "axis": {"title": "Energia · kWh"}}
  }
}
```

| Pomiar | Wartość | Status |
| --- | ---: | --- |
| Średnia dzienna | 18,2 kWh | Gotowe |
| Maksimum | 24 kWh | Czwartek |

## Model i wzory

Energia zależy od mocy oraz czasu: $E = P \cdot t$.

$$
E = \int_0^T P(t)\,dt \qquad \bar{P} = \frac{E}{T}
$$

```chart
type: function
y: a * sin(x)
x: {min: 0, max: 12, step: 0.05}
params:
  a: {value: 2, min: 0.5, max: 4, step: 0.1, name: "Amplituda "}
```

## Następne kroki

- [x] Zebrać pięć pomiarów
- [ ] Sprawdzić wpływ amplitudy suwakiem
- [ ] Powtórzyć pomiary w weekend

> Wynik zależy od czasu pomiaru. Zapisuj jednostki i założenia obok danych.

```python
energia = [12, 19, 15, 24, 21]
srednia = sum(energia) / len(energia)
print(f"Średnia: {srednia:.1f} kWh")
```
