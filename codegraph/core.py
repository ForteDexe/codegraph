import logging
import os
from argparse import Namespace
from collections import defaultdict, deque
from typing import Dict, List, Optional, Set, Text, Tuple

from codegraph.parser import Import, create_objects_array
from codegraph.utils import get_python_paths_list

logger = logging.getLogger(__name__)

aliases = {}


def read_file_content(path: Text) -> Text:
    try:
        with open(path, "r", encoding="utf-8") as file_read:
            return file_read.read()
    except UnicodeDecodeError:
        # Try with latin-1 as fallback, which accepts all byte values
        with open(path, "r", encoding="latin-1") as file_read:
            return file_read.read()


def parse_code_file(path: Text, base_paths: Optional[List] = None) -> List:
    """read module source and parse to get objects array"""
    source = read_file_content(path)
    # Pass full path to parser to support duplicate filenames
    parsed_module = create_objects_array(source=source, fname=path, base_paths=base_paths or [])
    return parsed_module


def get_code_objects(paths_list: List, base_paths: Optional[List] = None) -> Dict:
    """
        get all code files data for paths list
    :param paths_list: list with paths to code files to parse
    :param base_paths: list of base paths for calculating relative paths
    :return:
    """
    all_data = {}
    for path in paths_list:
        content = parse_code_file(path, base_paths)
        all_data[path] = content
    return all_data


class CodeGraph:
    def __init__(self, args: Namespace):
        self.base_paths = [os.path.abspath(p) for p in args.paths]
        self.paths_list = get_python_paths_list(args.paths, max_depth=args.depth)
        
        # Filter by keyword if provided
        if args.keyword:
            self.paths_list = self._filter_by_keyword(self.paths_list, args.keyword)
            if not self.paths_list:
                print(f"Warning: No files found containing keyword '{args.keyword}'")
        
        # get py modules list data
        self.modules_data = get_code_objects(self.paths_list, self.base_paths)
        
        # Store raw imports before they get popped by get_imports_and_entities_lines
        self.raw_imports = {}
        for module_path, parsed_objects in self.modules_data.items():
            for obj in parsed_objects:
                if isinstance(obj, Import):
                    self.raw_imports[module_path] = list(obj.modules)
                    break
        
        # Apply entity-level filtering if keyword is specified
        if args.keyword:
            self._filter_entities_by_keyword(args.keyword)
    
    def _filter_entities_by_keyword(self, keyword: str):
        """Filter entities within modules to only include those that use the keyword.
        
        Handles import aliases like 'import h13shotgrid as shotgrid' by tracking the alias name.
        Also includes entities that call other entities using the keyword (dependency chain).
        """
        keyword_lower = keyword.lower()
        
        for module_path, parsed_objects in self.modules_data.items():
            # Extract import statements and build alias mapping
            import_aliases = {}  # Maps alias/module name to original module name
            for obj in parsed_objects:
                if isinstance(obj, Import):
                    for module_import in obj.modules:
                        # Handle "import module as alias"
                        if " as " in module_import:
                            original, alias = module_import.split(" as ")
                            original = original.strip()
                            alias = alias.strip()
                            # Check if original matches keyword
                            if keyword_lower in original.lower():
                                import_aliases[alias.lower()] = original
                                import_aliases[original.lower()] = original
                        else:
                            # Handle "import module" or "from X import Y"
                            parts = module_import.split(".")
                            base_module = parts[0]
                            if keyword_lower in base_module.lower():
                                import_aliases[base_module.lower()] = base_module
            
            # If no matching imports found, skip filtering for this module
            if not import_aliases:
                continue
            
            # Read file content to check entity usage
            try:
                content = read_file_content(module_path)
                content_lower = content.lower()
            except Exception:
                continue
            
            # First pass: identify entities that directly use the keyword
            entities_using_keyword = set()
            entity_code_map = {}  # Map entity name to its code
            entity_objects = []  # Non-import objects
            
            for obj in parsed_objects:
                if isinstance(obj, Import):
                    continue
                    
                entity_objects.append(obj)
                entity_name = obj.name
                
                if hasattr(obj, 'lineno') and hasattr(obj, 'endno') and obj.lineno and obj.endno:
                    # Extract entity's code section
                    lines = content.split('\n')
                    entity_code = '\n'.join(lines[obj.lineno - 1:obj.endno])
                    entity_code_map[entity_name] = entity_code
                    entity_code_lower = entity_code.lower()
                    
                    # Check if entity uses any of the import aliases
                    for alias in import_aliases.keys():
                        if alias in entity_code_lower:
                            entities_using_keyword.add(entity_name)
                            break
            
            # Second pass: find entities that call entities using the keyword (dependency chain)
            # Keep iterating until no new entities are found
            entities_to_keep = set(entities_using_keyword)
            changed = True
            max_iterations = 10  # Prevent infinite loops
            iteration = 0
            
            while changed and iteration < max_iterations:
                changed = False
                iteration += 1
                
                for obj in entity_objects:
                    entity_name = obj.name
                    if entity_name in entities_to_keep:
                        continue
                    
                    if entity_name in entity_code_map:
                        entity_code_lower = entity_code_map[entity_name].lower()
                        
                        # Check if this entity calls any entity that's already in the keep set
                        for kept_entity in entities_to_keep:
                            # Look for function/method calls: kept_entity( or kept_entity.
                            if f'{kept_entity.lower()}(' in entity_code_lower or f'{kept_entity.lower()}.' in entity_code_lower:
                                entities_to_keep.add(entity_name)
                                changed = True
                                break
            
            # Build filtered objects list
            filtered_objects = []
            for obj in parsed_objects:
                if isinstance(obj, Import):
                    # Always keep Import objects
                    filtered_objects.append(obj)
                elif hasattr(obj, 'name') and obj.name in entities_to_keep:
                    filtered_objects.append(obj)
            
            # Update modules_data with filtered entities
            self.modules_data[module_path] = filtered_objects
    
    def _filter_by_keyword(self, paths_list: list, keyword: str) -> list:
        """Filter paths to only include files containing the keyword or their direct dependencies."""
        keyword_lower = keyword.lower()
        matching_files = set()
        
        # First pass: find files containing the keyword
        for path in paths_list:
            # Check if keyword is in filename
            if keyword_lower in os.path.basename(path).lower():
                matching_files.add(path)
                continue
            
            # Check if keyword is in file content or imports
            try:
                # Parse the file to extract imports using parse_code_file
                parsed_objects = parse_code_file(path, self.base_paths)
                
                # Check if any import contains the keyword
                for obj in parsed_objects:
                    if isinstance(obj, Import):
                        for module in obj.modules:
                            # Extract the actual import name from "module.name" or "name"
                            if " as " in module:
                                module = module.split(" as ")[0]
                            parts = module.split(".")
                            # Check all parts of the import for the keyword
                            for part in parts:
                                if keyword_lower in part.lower():
                                    matching_files.add(path)
                                    break
                            if path in matching_files:
                                break
                    if path in matching_files:
                        break
                
                # Also check file content for the keyword
                if path not in matching_files:
                    content = read_file_content(path)
                    if keyword_lower in content.lower():
                        matching_files.add(path)
            except Exception as e:
                # Skip files that can't be parsed/read
                logger.debug(f"Failed to parse {path}: {e}")
                pass
        
        if not matching_files:
            return []
        
        # Second pass: parse all files to find direct dependencies
        # Parse all files to build import mapping
        all_modules_data = {}
        for path in paths_list:
            try:
                all_modules_data[path] = parse_code_file(path, self.base_paths)
            except Exception:
                all_modules_data[path] = []
        
        # Extract imports from parsed data
        all_imports = {}
        for path, parsed_objects in all_modules_data.items():
            imports_list = []
            for obj in parsed_objects:
                if isinstance(obj, Import):
                    for module in obj.modules:
                        # Extract base import name
                        if " as " in module:
                            module = module.split(" as ")[0]
                        imports_list.append(module)
            all_imports[path] = imports_list
        
        # Build dependency graph
        result_files = set(matching_files)
        for match_file in matching_files:
            # Add files that import the keyword (already added in first pass)
            
            # Find files that the matching file depends on or that depend on it
            for file_path, imports in all_imports.items():
                # Check if this file imports something from match_file
                match_basename = os.path.basename(match_file).replace('.py', '')
                for imp in imports:
                    if match_basename in imp:
                        result_files.add(file_path)
                
                # Check if match_file imports something from this file  
                if match_file in all_imports:
                    file_basename = os.path.basename(file_path).replace('.py', '')
                    for imp in all_imports[match_file]:
                        if file_basename in imp:
                            result_files.add(file_path)
        
        return list(result_files)

    def get_lines_numbers(self):
        """
           return data with entities names and start and end line
        :return: Example: {'/Users/user/package/module_name.py':
                {'function': (1, 2), 'function_with_constant_return_int': (5, 6),
                'function_with_constant_return_float': (9, 10),
                'function_with_statement_return': (13, 14)..}}

                first number in tuple - start line, second - last line
        """
        data = {}
        for module in self.modules_data:
            data[module] = {}
            for func in self.modules_data[module]:
                data[module][func.name] = (func.lineno, func.endno)
        return data

    def get_entity_metadata(self) -> Dict:
        """
        Return metadata for all entities including line counts and types.
        :return: {module_path: {entity_name: {'lines': int, 'type': 'function'|'class'}}}
        """
        from codegraph.parser import Class, Function, AsyncFunction, Import

        data = {}
        for module_path in self.modules_data:
            data[module_path] = {}
            for entity in self.modules_data[module_path]:
                if isinstance(entity, Import):
                    continue
                lines = 0
                if entity.lineno and entity.endno:
                    lines = entity.endno - entity.lineno + 1

                entity_type = "function"
                if isinstance(entity, Class):
                    entity_type = "class"
                elif isinstance(entity, (Function, AsyncFunction)):
                    entity_type = "function"

                data[module_path][entity.name] = {
                    "lines": lines,
                    "entity_type": entity_type,
                    "lineno": entity.lineno,
                    "endno": entity.endno
                }
        return data

    def usage_graph(self) -> Dict:
        """
            module name: function
        :return:
        """
        entities_lines, imports, modules_names_map = get_imports_and_entities_lines(
            self.modules_data
        )
        entities_usage_in_modules = collect_entities_usage_in_modules(
            self.modules_data, imports, modules_names_map
        )
        # create edges
        dependencies = defaultdict(dict)
        for module in entities_usage_in_modules:
            dependencies[module] = defaultdict(list)
            for method_that_used in entities_usage_in_modules[module]:
                method_usage_lines = entities_usage_in_modules[module][method_that_used]
                for method_usage_line in method_usage_lines:
                    # Skip if method_usage_line is None (parsing issue)
                    if method_usage_line is None:
                        continue
                    for entity in entities_lines[module]:
                        if entity[0] <= method_usage_line <= entity[1]:
                            dependencies[module][entities_lines[module][entity]].append(
                                method_that_used
                            )
                            break
                    else:
                        # mean in global of module
                        dependencies[module]["_"].append(method_that_used)
        dependencies = populate_free_nodes(self.modules_data, dependencies, imports, modules_names_map)
        return dependencies

    def get_dependencies(self, file_path: str, distance: int) -> Dict[str, Set[str]]:
        """
        Get dependencies that are 'distance' nodes away from the given file.

        :param file_path: Path of the file to start from
        :param distance: Number of edges to traverse
        :return: Dictionary with distances as keys and sets of dependent files as values
        """
        dependencies = {i: set() for i in range(1, distance + 1)}
        graph = self.usage_graph()

        if file_path not in graph:
            return dependencies

        queue = deque([(file_path, 0)])
        visited = set()

        while queue:
            current_file, current_distance = queue.popleft()

            if current_distance >= distance:
                continue

            if current_file not in visited:
                visited.add(current_file)

                for entity, used_entities in graph[current_file].items():
                    for used_entity in used_entities:
                        if "." in used_entity:
                            dependent_file = used_entity.split(".")[0] + ".py"
                            if dependent_file != current_file:
                                dependencies[current_distance + 1].add(dependent_file)
                                queue.append((dependent_file, current_distance + 1))

        return dependencies


def get_module_name(code_path: Text, base_paths: Optional[List] = None) -> Text:
    """Get a unique module identifier using relative path.
    
    :param code_path: Full path to the module
    :param base_paths: List of base paths for calculating relative path
    :return: Relative path without .py extension (e.g., 'src/utils' or 'tests/utils')
    """
    from codegraph.utils import get_relative_path
    
    if base_paths:
        rel_path = get_relative_path(code_path, base_paths)
    else:
        rel_path = os.path.basename(code_path)
    
    # Remove .py extension
    if rel_path.endswith('.py'):
        rel_path = rel_path[:-3]
    
    return rel_path


def module_name_in_imports(imports: List, module_name: Text) -> bool:
    for import_ in imports:
        if module_name in import_:
            return True
    return False


def get_imports_and_entities_lines(  # noqa: C901
    code_objects: Dict,
) -> Tuple[Dict, Dict, Dict]:
    # todo: need to do optimization
    """
    joined together to avoid iteration several time
    imports - list of modules in code_objects Dict that used in current module
    """
    entities_lines = defaultdict(dict)
    imports = defaultdict(list)
    modules_ = code_objects.keys()
    names_map = {}
    
    # Get base paths from any parsed object's file attribute
    # This is a bit of a workaround - ideally we'd pass base_paths as a parameter
    base_paths = []
    for path in modules_:
        parent_dir = os.path.dirname(path)
        if parent_dir and parent_dir not in base_paths:
            # Add parent directories as potential base paths
            base_paths.append(parent_dir)
    
    # Build a set of all module names for quick lookup (now using relative paths)
    module_names_set = {get_module_name(m, base_paths) for m in modules_}

    for path in code_objects:
        names_map[get_module_name(path, base_paths)] = path
        # for each module in list
        if code_objects[path] and isinstance(code_objects[path][-1], Import):
            # extract imports if exist
            for import_ in code_objects[path].pop(-1).modules:
                pathed_import = import_
                alias = None
                if " as " in pathed_import:
                    pathed_import, alias = pathed_import.split(" as ")

                parts = pathed_import.split(".")
                matched = False

                # Try each part from right to left to find a module match
                # e.g., simple_ddl_parser.output.dialects.dialect_by_name
                # -> try: dialect_by_name (no), dialects (yes!)
                for i in range(len(parts) - 1, -1, -1):
                    candidate = parts[i]

                    # Check if this part matches a module name
                    if candidate in module_names_set:
                        for module_ in modules_:
                            if candidate in module_:
                                if alias:
                                    aliases[candidate] = alias
                                imports[path].append(candidate)
                                matched = True
                                break
                        if matched:
                            break

                    # Check for __init__.py - if the candidate is a package name
                    # e.g., from simple_ddl_parser import X -> simple_ddl_parser/__init__.py
                    if not matched:
                        for module_ in modules_:
                            # Check if this is a package __init__.py
                            if f"/{candidate}/__init__.py" in module_ or module_.endswith(f"{candidate}/__init__.py"):
                                if alias:
                                    aliases[candidate] = alias
                                imports[path].append("__init__")
                                matched = True
                                break
                        if matched:
                            break

        for entity in code_objects[path]:
            # create a dict with lines of start and end for each entity in module
            # Skip entities with None line numbers to prevent TypeError
            if entity.lineno is not None and entity.endno is not None:
                entities_lines[path][(entity.lineno, entity.endno)] = entity.name
    return entities_lines, imports, names_map


def search_entities_from_list_in_code(
    entities_list: List, module_name: Text, line: Text
) -> Text:
    for entity in entities_list:
        if search_entity_usage(module_name, entity.name, line):
            yield entity


def search_entities_from_module_in_code(
    _module: Text, _path: Text, code_objects: Dict, code: List, current: bool = False
) -> Dict:
    found_entities = defaultdict(list)
    for num, line in enumerate(code):
        if (
            not line.startswith("#")
            and not line.startswith('"')
            and not line.startswith("'")
        ):
            entities_in_line = [
                x
                for x in search_entities_from_list_in_code(
                    code_objects[_path], _module, line
                )
            ]
            for entity in entities_in_line:
                prefix = f"{_module}." if not current else ""
                found_entities[f"{prefix}{entity.name}"].append(num + 1)
    return found_entities


def collect_entities_usage_in_modules(
    code_objects: Dict, imports: Dict, modules_names_map: Dict
) -> Dict:
    entities_usage_in_modules = defaultdict(dict)
    for path in code_objects:
        entities_usage_in_modules[path] = defaultdict(list)
        logger.debug(f"Processing module: {path}")
        logger.debug(f"Imports in module: {imports[path]}")
        module_content = read_file_content(path)
        # to reduce count of iteration, we not need lines with functions and classes defenitions
        module_content = (
            module_content.replace("async ", "# async ")
            .replace("def ", "# def ")
            .replace("class ", "# class ")
        )
        # split by line
        code = module_content.split("\n")
        for _module in imports[path]:
            # search entities from other modules (skip if not in analyzed codebase)
            if _module not in modules_names_map:
                continue
            _path = modules_names_map[_module]
            entities_usage_in_modules[path].update(
                search_entities_from_module_in_code(_module, _path, code_objects, code)
            )
        # search entities from current module
        entities_usage_in_modules[path].update(
            search_entities_from_module_in_code(
                get_module_name(path), path, code_objects, code, current=True
            )
        )
    return entities_usage_in_modules


def populate_free_nodes(code_objects: Dict, dependencies: Dict, imports: Dict, modules_names_map: Dict) -> Dict:
    from codegraph.parser import Class

    for path in code_objects:
        # Create module-to-module connections based on imports
        # This ensures we show connections even when specific entities aren't detected
        # (e.g., when importing variables or when entity usage detection misses something)
        if imports.get(path):
            if "_" not in dependencies[path]:
                dependencies[path]["_"] = []
            for imp in imports[path]:
                import_dep = f"{imp}._"
                if import_dep not in dependencies[path]["_"]:
                    dependencies[path]["_"].append(import_dep)

        for entity in code_objects[path]:
            if entity.name not in dependencies[path]:
                dependencies[path][entity.name] = []

            # Add inheritance connections for classes
            if isinstance(entity, Class) and entity.super:
                for base_class in entity.super:
                    # Try to find the base class in imports or local module
                    base_found = False

                    # Check if it's a dotted name (e.g., module.ClassName)
                    if "." in base_class:
                        # Already qualified, add as-is
                        dependencies[path][entity.name].append(base_class)
                        base_found = True
                    else:
                        # Search in imports for this module
                        for imp in imports.get(path, []):
                            # Import could be like "dialects.HQL" or "simple_ddl_parser.dialects.HQL"
                            if imp.endswith("." + base_class) or imp.endswith("." + base_class.split(" as ")[0]):
                                # Found the import, extract module name
                                parts = imp.split(".")
                                if len(parts) >= 2:
                                    module_name = parts[-2]  # e.g., "dialects" from "simple_ddl_parser.dialects.HQL"
                                    dependencies[path][entity.name].append(f"{module_name}.{base_class}")
                                    base_found = True
                                    break

                        # If not found in imports, check if it's a local class
                        if not base_found:
                            for local_entity in code_objects[path]:
                                if local_entity.name == base_class:
                                    # It's a local class, add without module prefix
                                    dependencies[path][entity.name].append(base_class)
                                    base_found = True
                                    break

                        # If still not found, add as-is (might be external)
                        if not base_found:
                            dependencies[path][entity.name].append(base_class)

    return dependencies


def search_entity_usage(module_name: Text, name: Text, line: Text) -> bool:
    """check exist method or entity usage in line or not"""
    method_call = name + "("
    dot_access = name + "."
    if (
        method_call in line
        or " " + dot_access in line
        or f"{module_name}." + method_call in line
        or f"{module_name}." + dot_access in line
    ):
        return True
    elif module_name in aliases:
        if aliases[module_name] + "." + method_call in line:
            return True
    return False
