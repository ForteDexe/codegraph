1. Core Module (core.py)
Updated parse_code_file() to pass full paths (instead of basename) to the parser
Modified get_module_name() to return relative path-based keys (e.g., src/utils instead of utils)
Changed get_code_objects() and CodeGraph.__init__() to track and pass base_paths
Updated get_imports_and_entities_lines() to build module_names_set and names_map using relative paths
2. Visualization Module (vizualyzer.py)
Modified convert_to_d3_format() to generate unique node IDs from relative paths
Module node IDs are now path-based (e.g., src/utils, tests/utils) without .py extension
Entity node IDs use format path/module:entity_name (e.g., src/utils:helper)
Updated entity_to_module mappings to use path-based identifiers
Fixed dependency resolution loops to correctly attribute dependencies using relative paths
Updated draw_graph(), draw_graph_matplotlib(), and export_to_csv() to accept and use base_paths
CSV export now shows basenames with .py extension in the name column for backward compatibility
3. Parser Module (parser.py)
Updated create_objects_array() to accept full paths in the fname parameter
Added base_paths parameter for future path-relative calculations
4. Utilities Module (utils.py)
Added get_relative_path() helper function to calculate relative paths from a list of base paths
Normalizes path separators to forward slashes for cross-platform consistency
5. Main Module (main.py)
Updated to extract base_paths from CodeGraph instance
Passes base_paths to all visualization functions
6. Frontend (main.js)
Already handles n.label || n.id pattern correctly
Module nodes now display basename in labels while using path-based IDs internally
fullPath attribute available in tooltips for disambiguation

For modules: Shows the full file path (e.g., utils.py or utils.py)
For entities: Shows the parent module (e.g., src/utils for src_helper function)

Design Decisions Implemented:
Clean relative paths for readability ✓

Node IDs use sanitized relative paths: src/utils instead of utils.py
Easy to read and understand in visualizations
Basename for node labels + full path in tooltips ✓

Module nodes show just the filename (e.g., utils) in the UI
Full relative path available in the fullPath attribute for tooltips
Users see familiar names while the system maintains unique identifiers
Acceptable to break saved HTML files ✓

Node ID format changed from module.py to module (relative path without extension)
Existing visualizations will need to be regenerated