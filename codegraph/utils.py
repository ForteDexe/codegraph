import glob
import os
from pathlib import Path
from typing import List, Union


def get_relative_path(file_path: str, base_paths: List[str]) -> str:
    """
    Get a relative path from file_path based on the closest matching base path.
    If no base path matches, return the basename.
    
    :param file_path: Absolute path to the file
    :param base_paths: List of base paths to calculate relative path from
    :return: Relative path string
    """
    file_path = os.path.normpath(file_path)
    
    # Try to find the closest matching base path
    best_rel_path = os.path.basename(file_path)
    
    for base_path in base_paths:
        base_path = os.path.normpath(base_path)
        try:
            rel_path = os.path.relpath(file_path, base_path)
            # Only use this if the file is actually under this base path
            if not rel_path.startswith('..'):
                # Use the shortest relative path found
                if len(rel_path) < len(best_rel_path) or best_rel_path == os.path.basename(file_path):
                    best_rel_path = rel_path
        except (ValueError, TypeError):
            # Can happen on Windows with different drives
            continue
    
    # Normalize path separators to forward slashes for consistency
    return best_rel_path.replace('\\', '/')


def get_python_paths_list(paths: Union[str, List], max_depth: int = None) -> List[str]:
    """
        return list of paths to python files, that found in provided path
    :param paths: paths to folder or python file that need to tests
    :param max_depth: maximum subfolder depth to scan (1=original/sub1, 2=original/sub1/sub2, etc.)
    :return:
    """
    if isinstance(paths, str):
        paths = [paths]
    if len(paths) == 1 and paths[0].endswith(".py"):
        # mean provided path to one python module
        path = Path(paths[0]).absolute()
        if not path.exists():
            raise ValueError(f"Path {path.as_posix()} does not exists")
        return [path.as_posix()]

    paths_list = []
    for path in paths:
        path = Path(path).absolute()
        if not path.exists():
            raise ValueError(f"Path {path.as_posix()} does not exist")
        # Get all Python files recursively, excluding hidden folders (starting with '.')
        all_files = glob.glob(str(path / "**" / "*.py"), recursive=True)
        paths_list += [
            Path(p).as_posix()
            for p in all_files
            # Skip files in folders starting with '.' (like .conda, .vscode, .git, etc.)
            # and respect max_depth if specified
            if not any(part.startswith('.') for part in Path(p).relative_to(path).parts[:-1])
            and (max_depth is None or len(Path(p).relative_to(path).parts) - 1 <= max_depth)
        ]
    return paths_list
