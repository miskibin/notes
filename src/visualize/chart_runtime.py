"""Numerical plotting in a worker's virtual filesystem; no host Python is used."""

import ast
import base64
import builtins
import io
import json
import math

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import scipy

_MODULES = {
    "math", "numpy", "scipy", "matplotlib.pyplot", "matplotlib.colors",
    "matplotlib.patches", "matplotlib.ticker", "matplotlib.cm", "mpl_toolkits.mplot3d",
}
_BLOCKED = {
    "eval", "exec", "compile", "open", "input", "getattr", "setattr", "delattr",
    "globals", "locals", "vars", "dir", "help", "breakpoint", "memoryview",
    "load", "loadtxt", "genfromtxt", "fromfile", "tofile", "save", "savez",
    "savez_compressed", "memmap", "ctypes", "f2py", "savefig", "imread", "imsave",
    "show", "print", "print_figure", "switch_backend", "use", "rcParams",
    "get_configdir", "get_cachedir", "get_data_path", "install", "read", "write",
}
_BUILTINS = {
    name: getattr(builtins, name) for name in (
        "abs", "all", "any", "bool", "complex", "dict", "enumerate", "filter",
        "float", "int", "isinstance", "len", "list", "map", "max", "min", "pow",
        "range", "reversed", "round", "set", "slice", "sorted", "str", "sum",
        "tuple", "zip", "ValueError", "TypeError", "Exception",
    )
}


def _module_allowed(name: str) -> bool:
    return not any(part.startswith("_") for part in name.split(".")) and (
        name in _MODULES or name.startswith("numpy.") or name.startswith("scipy.")
    )


def _chart_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level or not _module_allowed(name):
        raise ValueError(f"Unsupported import: {name}. Use matplotlib, NumPy or SciPy.")
    if any(part.startswith("_") or part == "*" or part in _BLOCKED for part in fromlist):
        raise ValueError("Private and wildcard imports are not supported.")
    return builtins.__import__(name, globals, locals, fromlist, level)


def _validate_chart(source: str) -> ast.Module:
    if not isinstance(source, str) or not source.strip() or len(source) > 20_000:
        raise ValueError("Chart code is empty or too long.")
    tree = ast.parse(source, mode="exec")
    for node in ast.walk(tree):
        if isinstance(node, (ast.ClassDef, ast.Global, ast.Nonlocal, ast.AsyncFunctionDef,
                             ast.Await, ast.With, ast.AsyncWith, ast.Delete)):
            raise ValueError("Only numerical computation and plotting are supported.")
        if isinstance(node, ast.FunctionDef) and node.decorator_list:
            raise ValueError("Decorators are not supported.")
        if isinstance(node, ast.Name):
            if node.id.startswith("_") or node.id in _BLOCKED:
                raise ValueError(f"Unsupported name: {node.id}")
            if isinstance(node.ctx, ast.Store) and node.id in {"plt", "np", "scipy", "math"}:
                raise ValueError("Do not replace the plotting modules.")
        if isinstance(node, ast.Attribute) and (node.attr.startswith("_") or node.attr in _BLOCKED):
            raise ValueError(f"Unsupported operation: {node.attr}")
        if isinstance(node, ast.Import):
            for alias in node.names:
                if not _module_allowed(alias.name) or (alias.asname and alias.asname.startswith("_")):
                    raise ValueError(f"Unsupported import: {alias.name}")
        if isinstance(node, ast.ImportFrom):
            if node.level or not _module_allowed(node.module or ""):
                raise ValueError(f"Unsupported import: {node.module}")
            for alias in node.names:
                if alias.name.startswith("_") or alias.name == "*" or alias.name in _BLOCKED or (alias.asname and alias.asname.startswith("_")):
                    raise ValueError("Private and wildcard imports are not supported.")
    return tree


def _render_chart(source: str) -> str:
    tree = _validate_chart(source)
    plt.close("all")
    plt.rcdefaults()
    plt.rcParams.update({"figure.figsize": (8, 5), "figure.dpi": 130,
                         "figure.facecolor": "white", "axes.facecolor": "white"})
    environment = {"__builtins__": {**_BUILTINS, "__import__": _chart_import},
                   "plt": plt, "np": np, "scipy": scipy, "math": math}
    try:
        exec(compile(tree, "<visualization>", "exec"), environment, environment)
        if len(plt.get_fignums()) != 1:
            raise ValueError("Create exactly one matplotlib figure.")
        figure = plt.gcf()
        size = np.clip(figure.get_size_inches(), 2, 14)
        figure.set_size_inches(size)
        figure.set_dpi(130)
        image = io.BytesIO()
        figure.savefig(image, format="png", dpi=130, facecolor="white")
        data = image.getvalue()
        if len(data) > 6 * 1024 * 1024:
            raise ValueError("The chart image is too large. Simplify the figure.")
        width, height = figure.canvas.get_width_height()
        return json.dumps({"dataUrl": "data:image/png;base64," + base64.b64encode(data).decode("ascii"),
                           "width": width, "height": height})
    finally:
        plt.close("all")
