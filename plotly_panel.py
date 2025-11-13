from __future__ import annotations

try:
    import plotly.graph_objs as go
except ModuleNotFoundError:  # pragma: no cover - fallback for constrained envs
    class _FallbackFigure:
        def __init__(self, data=None) -> None:
            self._data = data or []
            self._layout = {}

        def update_xaxes(self, **kwargs):
            self._layout.setdefault("xaxis", {}).update(kwargs)
            return self

        def update_yaxes(self, **kwargs):
            self._layout.setdefault("yaxis", {}).update(kwargs)
            return self

        def update_layout(self, **kwargs):
            self._layout.update(kwargs)
            return self

        def to_plotly_json(self):
            return {"data": self._data, "layout": self._layout}

    class _GraphObjectsModule:
        Figure = _FallbackFigure

    go = _GraphObjectsModule()


def build_sample_figure() -> go.Figure:
    """Return an empty Plotly figure with axis/grid styling."""

    # 空の Figure を基点に、Plotly 上で図形を描画しやすいグリッドと補助線を整える。
    fig = go.Figure(data=[])

    # X/Y 共通の軸設定。原点付近での編集を想定してゼロラインとグリッドを濃いめにする。
    axis_style = dict(
        showgrid=True,
        gridcolor="#d9dee7",
        gridwidth=1,
        zeroline=True,
        zerolinecolor="#9fb3d1",
        zerolinewidth=2,
        showline=True,
        linewidth=2,
        linecolor="#6b7a99",
        range=[-1000, 1000],
        constrain="range",
        tick0=0,
        dtick=100,
        minor=dict(showgrid=True, gridcolor="#f2f5fb", gridwidth=0.5, dtick=50),
    )
    fig.update_xaxes(title="X[mm]", **axis_style)
    fig.update_yaxes(title="Y[mm]", scaleanchor="x", scaleratio=1, **axis_style)

    # 250mm 間隔の補助線で安全領域のバランスを視覚的に把握しやすくする。
    helper_lines = []
    for value in (-750, -500, -250, 250, 500, 750):
        helper_lines.append(
            dict(
                type="line",
                xref="x",
                yref="y",
                x0=-1000,
                x1=1000,
                y0=value,
                y1=value,
                line=dict(color="#cbd5f5", width=1, dash="dot"),
            )
        )
        helper_lines.append(
            dict(
                type="line",
                xref="x",
                yref="y",
                x0=value,
                x1=value,
                y0=-1000,
                y1=1000,
                line=dict(color="#cbd5f5", width=1, dash="dot"),
            )
        )

    # 背景を白で固定し、Legend を上部にまとめて UI と馴染ませる。
    fig.update_layout(
        plot_bgcolor="#ffffff",
        paper_bgcolor="#ffffff",
        margin=dict(l=60, r=20, t=30, b=60),
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        shapes=helper_lines,
    )

    return fig
