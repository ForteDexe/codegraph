// Panel drag and collapse functionality
document.querySelectorAll('.panel').forEach(panel => {
    const header = panel.querySelector('.panel-header');
    const toggleBtn = panel.querySelector('.panel-toggle');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    // Collapse/expand
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('collapsed');
        toggleBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        toggleBtn.title = panel.classList.contains('collapsed') ? 'Expand' : 'Collapse';
    });

    // Drag functionality
    header.addEventListener('mousedown', (e) => {
        if (e.target === toggleBtn) return;
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = startLeft + 'px';
        panel.style.top = startTop + 'px';
        document.body.style.cursor = 'move';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.left = (startLeft + dx) + 'px';
        panel.style.top = (startTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = '';
    });
});

// Calculate stats
const moduleCount = graphData.nodes.filter(n => n.type === 'module').length;
const entityCount = graphData.nodes.filter(n => n.type === 'entity').length;
const moduleLinks = graphData.links.filter(l => l.type === 'module-module').length;
document.getElementById('stats-content').innerHTML = `
    <p>Modules: ${moduleCount}</p>
    <p>Entities: ${entityCount}</p>
    <p>Module connections: ${moduleLinks}</p>
`;

// Calculate links count for each node
const nodeLinksMap = {};
graphData.nodes.forEach(n => {
    nodeLinksMap[n.id] = { linksIn: 0, linksOut: 0 };
});
graphData.links.forEach(l => {
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
    if (nodeLinksMap[sourceId]) nodeLinksMap[sourceId].linksOut++;
    if (nodeLinksMap[targetId]) nodeLinksMap[targetId].linksIn++;
});

// Populate unlinked modules panel
const unlinkedModules = graphData.unlinkedModules || [];
document.getElementById('unlinked-count').textContent = `(${unlinkedModules.length})`;
if (unlinkedModules.length > 0) {
    document.getElementById('unlinked-list').innerHTML = `
        <ul>
            ${unlinkedModules.map(m => `
                <li data-module-id="${m.id}" title="${m.fullPath}">
                    ${m.id}
                    <span class="path">${m.fullPath}</span>
                </li>
            `).join('')}
        </ul>
    `;
} else {
    document.getElementById('unlinked-list').innerHTML = '<p style="color: #888; padding: 5px;">No unlinked modules</p>';
}

// Tab switching for unlinked panel
document.querySelectorAll('.unlinked-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.unlinked-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.unlinked-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// Links count filter function
function updateLinksCount() {
    const threshold = parseInt(document.getElementById('links-threshold').value) || 0;
    const countIn = document.getElementById('links-in-check').checked;
    const countOut = document.getElementById('links-out-check').checked;

    const nodesWithLinks = graphData.nodes
        .filter(n => n.type === 'module' || n.type === 'entity')
        .map(n => {
            const links = nodeLinksMap[n.id] || { linksIn: 0, linksOut: 0 };
            let total = 0;
            if (countIn && countOut) total = links.linksIn + links.linksOut;
            else if (countIn) total = links.linksIn;
            else if (countOut) total = links.linksOut;
            return { ...n, linksIn: links.linksIn, linksOut: links.linksOut, totalLinks: total };
        })
        .filter(n => n.totalLinks > threshold)
        .sort((a, b) => b.totalLinks - a.totalLinks);

    document.getElementById('links-count').textContent = `(${nodesWithLinks.length})`;

    if (nodesWithLinks.length > 0) {
        document.getElementById('links-count-content').innerHTML = `
            <ul>
                ${nodesWithLinks.map(n => `
                    <li data-node-id="${n.id}" title="${n.type === 'module' ? n.fullPath : n.parent}">
                        <span class="links-count">${n.totalLinks}</span> ${n.label || n.id}
                        <span class="entity-type">${n.type === 'module' ? 'module' : n.entityType}</span>
                    </li>
                `).join('')}
            </ul>
        `;

        // Add click handlers for links count items
        document.querySelectorAll('#links-count-content li').forEach(li => {
            li.addEventListener('click', () => {
                const nodeId = li.dataset.nodeId;
                highlightNode(nodeId);
            });
        });
    } else {
        document.getElementById('links-count-content').innerHTML = '<p style="color: #888;">No matching nodes</p>';
    }
}

// Initialize links count and add event listeners
document.getElementById('links-in-check').addEventListener('change', updateLinksCount);
document.getElementById('links-out-check').addEventListener('change', updateLinksCount);
document.getElementById('links-threshold').addEventListener('input', updateLinksCount);
updateLinksCount();

// Size scaling state
let sizeByCode = false;

// Calculate max lines for scaling
const maxLines = Math.max(...graphData.nodes.map(n => n.lines || 0), 1);

// Function to get node size based on lines of code
function getNodeSize(d, baseSize) {
    if (!sizeByCode || !d.lines) return baseSize;
    // Scale between baseSize and baseSize * 3 based on lines
    const scale = 1 + (d.lines / maxLines) * 2;
    return baseSize * scale;
}

// Function to update massive objects list
function updateMassiveObjects() {
    const threshold = parseInt(document.getElementById('massive-threshold').value) || 50;
    const showModules = document.getElementById('filter-modules').checked;
    const showClasses = document.getElementById('filter-classes').checked;
    const showFunctions = document.getElementById('filter-functions').checked;

    const massiveNodes = graphData.nodes
        .filter(n => (n.type === 'entity' || n.type === 'module') && n.lines >= threshold)
        .filter(n => {
            if (n.type === 'module') return showModules;
            if (n.entityType === 'class') return showClasses;
            if (n.entityType === 'function') return showFunctions;
            return true;
        })
        .sort((a, b) => b.lines - a.lines);

    document.getElementById('massive-count').textContent = `(${massiveNodes.length})`;
    document.getElementById('massive-list').innerHTML = massiveNodes.map(n => `
        <li data-node-id="${n.id}" title="${n.type === 'module' ? n.fullPath : n.parent}">
            <span class="lines">${n.lines}</span> ${n.label || n.id}
            <span class="entity-type">${n.type === 'module' ? 'module' : n.entityType}</span>
        </li>
    `).join('');

    // Add click handlers
    document.querySelectorAll('#massive-list li').forEach(li => {
        li.addEventListener('click', () => {
            const nodeId = li.dataset.nodeId;
            highlightNode(nodeId);
        });
    });
}

// Add event listeners for massive objects filters
document.getElementById('filter-modules').addEventListener('change', updateMassiveObjects);
document.getElementById('filter-classes').addEventListener('change', updateMassiveObjects);
document.getElementById('filter-functions').addEventListener('change', updateMassiveObjects);
document.getElementById('massive-threshold').addEventListener('input', updateMassiveObjects);

// Initial population
updateMassiveObjects();

const width = window.innerWidth;
const height = window.innerHeight;

// Create SVG
const svg = d3.select("#graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// Add zoom behavior
const g = svg.append("g");

// Function to update font sizes based on zoom scale
function updateFontSizes(scale) {
    labels.style("font-size", function(d) {
        const baseSize = d.type === 'module' ? 13 : 11;
        const scaledSize = baseSize / scale;
        const isHighlighted = d3.select(this).classed('highlighted-label');
        const maxSize = isHighlighted ? maxHighlightFontSize : 24;
        // Clamp to reasonable range
        return Math.max(6, Math.min(maxSize, scaledSize)) + "px";
    });
}

function updateIconWireSizes(scale) {
    // Update node sizes with scaling
    node.each(function(d) {
        const el = d3.select(this);
        const isHighlighted = el.classed('highlighted-main') || el.classed('highlighted');
        const isDimmed = el.classed('dimmed');
        const multiplier = (isHighlighted && !isDimmed) ? iconWireScaleFactor / scale : 1;
        if (d.type === "module") {
            const baseSize = getNodeSize(d, 30);
            const size = baseSize * multiplier;
            // Use scale factor to determine reasonable max (higher scale factor = higher max)
            const maxSize = 200 * iconWireScaleFactor;
            const clampedSize = Math.max(10, Math.min(maxSize, size));
            el.select("rect")
                .attr("width", clampedSize)
                .attr("height", clampedSize)
                .attr("x", -clampedSize / 2)
                .attr("y", -clampedSize / 2);
        } else if (d.type === "entity" || d.type === "external") {
            const baseR = getNodeSize(d, 10);
            const r = baseR * multiplier;
            // Use scale factor to determine reasonable max (higher scale factor = higher max)
            const maxR = 100 * iconWireScaleFactor;
            const clampedR = Math.max(5, Math.min(maxR, r));
            el.select("circle").attr("r", clampedR);
        }
    });
    // Update link stroke widths
    link.each(function(d) {
        const el = d3.select(this);
        const isHighlighted = el.classed('highlighted');
        const isDimmed = el.classed('dimmed');
        
        // Use same multiplier as icons - only highlighted arrows scale with zoom
        const multiplier = (isHighlighted && !isDimmed) ? iconWireScaleFactor / scale : 1;
        
        // Use same base width for all link types for consistent arrow scaling
        const baseWidth = 2;
        
        const width = baseWidth * multiplier;
        // Reduce max for better balance
        const maxWidth = 18.75 * iconWireScaleFactor;
        const clampedWidth = Math.max(1, Math.min(maxWidth, width));
        el.style("stroke-width", clampedWidth + "px");
    });
    // Update labels position
    labels.attr("dy", d => {
        const el = node.filter(n => n.id === d.id);
        if (d.type === "module") {
            const size = +el.select("rect").attr("width");
            return size / 2 + 15;
        } else {
            const r = +el.select("circle").attr("r");
            return r + 10;
        }
    });
}

function isLinkHighlighted(d, highlightedNodeId) {
    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
    const targetId = typeof d.target === 'object' ? d.target.id : d.target;
    const isOut = sourceId === highlightedNodeId;
    const isIn = targetId === highlightedNodeId;
    if (d.type === 'module-module') {
        if (isOut && highlightLinkFilters.mmOut) return true;
        if (isIn && highlightLinkFilters.mmIn) return true;
    } else if (d.type === 'module-entity') {
        if (isOut && highlightLinkFilters.meOut) return true;
        if (isIn && highlightLinkFilters.meIn) return true;
    } else if (d.type === 'dependency') {
        // Entity-to-entity or entity-to-external dependencies
        // Always highlight these when the entity is selected
        if (isOut || isIn) return true;
    }
    return false;
}

function formatPathForDisplay(fullPath, levels) {
    if (!fullPath) return '';
    
    const parts = fullPath.split(/[\/\\]/);
    if (levels <= 0) {
        // Return just filename
        return parts[parts.length - 1] || '';
    }
    
    const startIndex = Math.max(0, parts.length - levels - 1);
    return parts.slice(startIndex).join('/');
}

function updatePathDisplay() {
    labels.text(function(d) {
        const isHighlighted = d3.select(this).classed('highlighted-label');
        const originalLabel = d.label || d.id;
        
        if (!isHighlighted) {
            return originalLabel;
        }
        
        const fullPath = d.fullPath || d.parent;
        if (!fullPath) return originalLabel;
        
        const displayPath = formatPathForDisplay(fullPath, pathSubfolderLevels);
        return displayPath || originalLabel;
    });
}

const zoom = d3.zoom()
    .scaleExtent([0.05, 4])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
        currentScale = event.transform.k;
        // Adjust font sizes based on zoom scale
        updateFontSizes(currentScale);
        updateIconWireSizes(currentScale);
    });

svg.call(zoom);

// Handle clicks on blank space to unpin highlighted node and zoom out
svg.on("click", function(event) {
    // Only trigger if clicking on the SVG itself (not on nodes or other elements)
    if (event.target === this && currentHighlightedNode !== null) {
        clearHighlight();
        zoomToFit();
    }
});

// Tooltip
const tooltip = d3.select("#tooltip");

// Track collapsed nodes (modules and entities)
const collapsedNodes = new Set();

// Create arrow markers for different link types
const defs = svg.append("defs");

// Module-module arrow (orange)
defs.append("marker")
    .attr("id", "arrow-module-module")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("fill", "#ff9800")
    .attr("d", "M0,-5L10,0L0,5");

// Module-entity arrow (green)
defs.append("marker")
    .attr("id", "arrow-module-entity")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("fill", "#009c2c")
    .attr("d", "M0,-5L10,0L0,5");

// Dependency arrow (red)
defs.append("marker")
    .attr("id", "arrow-dependency")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("fill", "#d94a4a")
    .attr("d", "M0,-5L10,0L0,5");

// Scale spacing based on number of nodes
const nodeCount = graphData.nodes.length;
const scaleFactor = nodeCount > 40 ? 1 + (nodeCount - 40) / 50 : 1;

// Flag to ensure zoom-to-fit only happens once
let initialZoomDone = false;

// Create force simulation with adjusted parameters for better spacing
const simulation = d3.forceSimulation(graphData.nodes)
    .force("link", d3.forceLink(graphData.links).id(d => d.id).distance(d => {
        const base = d.type === 'module-module' ? 300 : d.type === 'module-entity' ? 100 : 120;
        return base * scaleFactor;
    }).strength(0.3 / scaleFactor))
    .force("charge", d3.forceManyBody().strength(d => {
        const base = d.type === 'module' ? -800 : -300;
        return base * scaleFactor;
    }))
    .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05 / scaleFactor))
    .force("collision", d3.forceCollide().radius(d => {
        const base = d.type === 'module' ? 80 : 40;
        return base * scaleFactor;
    }).strength(1));

// Create links (module-module first so they appear behind)
const link = g.append("g")
    .selectAll("line")
    .data(graphData.links.sort((a, b) => {
        const order = {'module-module': 0, 'module-entity': 1, 'dependency': 2};
        return (order[a.type] || 2) - (order[b.type] || 2);
    }))
    .join("line")
    .attr("class", d => `link link-${d.type}`)
    .attr("marker-end", d => `url(#arrow-${d.type})`);

// Create nodes
const node = g.append("g")
    .selectAll("g")
    .data(graphData.nodes)
    .join("g")
    .attr("class", "node")
    .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

// Add shapes based on node type with size based on lines of code
node.each(function(d) {
    const el = d3.select(this);
    if (d.type === "module") {
        const size = getNodeSize(d, 30);
        el.append("rect")
            .attr("class", "node-module")
            .attr("width", size)
            .attr("height", size)
            .attr("x", -size / 2)
            .attr("y", -size / 2)
            .attr("rx", 4);
    } else if (d.type === "entity") {
        const r = getNodeSize(d, 10);
        el.append("circle")
            .attr("class", "node-entity")
            .attr("r", r);
    } else {
        el.append("circle")
            .attr("class", "node-external")
            .attr("r", 7);
    }
});

// Function to update node sizes
function updateNodeSizes() {
    node.each(function(d) {
        const el = d3.select(this);
        if (d.type === "module") {
            const size = getNodeSize(d, 30);
            el.select("rect")
                .attr("width", size)
                .attr("height", size)
                .attr("x", -size / 2)
                .attr("y", -size / 2);
        } else if (d.type === "entity") {
            const r = getNodeSize(d, 10);
            el.select("circle").attr("r", r);
        }
    });
    // Update labels position
    labels.attr("dy", d => {
        if (d.type === "module") {
            return getNodeSize(d, 30) / 2 + 15;
        }
        return getNodeSize(d, 10) + 10;
    });
}

// Size toggle event listener
document.getElementById('size-by-code').addEventListener('change', function() {
    sizeByCode = this.checked;
    updateNodeSizes();
    updateIconWireSizes(currentScale);
});

// Display filter state
const displayFilters = {
    showModules: true,
    showClasses: false,
    showFunctions: false,
    showExternal: true,
    showLinkModule: true,
    showLinkEntity: true,
    showLinkDependency: true
};

// Display filter event listeners
document.getElementById('show-modules').addEventListener('change', function() {
    displayFilters.showModules = this.checked;
    updateDisplayFilters();
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('show-classes').addEventListener('change', function() {
    displayFilters.showClasses = this.checked;
    updateDisplayFilters();
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('show-functions').addEventListener('change', function() {
    displayFilters.showFunctions = this.checked;
    updateDisplayFilters();
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('show-external').addEventListener('change', function() {
    displayFilters.showExternal = this.checked;
    updateDisplayFilters();
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('show-link-module').addEventListener('change', function() {
    displayFilters.showLinkModule = this.checked;
    updateDisplayFilters();
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('show-link-entity').addEventListener('change', function() {
    displayFilters.showLinkEntity = this.checked;
    updateDisplayFilters();
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('show-link-dependency').addEventListener('change', function() {
    displayFilters.showLinkDependency = this.checked;
    updateDisplayFilters();
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('max-highlight-font').addEventListener('input', function() {
    maxHighlightFontSize = parseInt(this.value) || 32;
    // Update font sizes immediately
    updateFontSizes(currentScale);
});
document.getElementById('icon-wire-scale').addEventListener('input', function() {
    iconWireScaleFactor = parseFloat(this.value) || 1.0;
    // Update icon and wire sizes immediately
    updateIconWireSizes(currentScale);
});
document.getElementById('highlight-focus-mode').addEventListener('change', function() {
    highlightFocusMode = this.checked;
    if (currentHighlightedNode) {
        highlightNode(currentHighlightedNode);
    } else if (!this.checked) {
        // When turning off focus mode without active highlight, restore display filters
        updateDisplayFilters();
    }
});
document.getElementById('highlight-link-mm-out').addEventListener('change', function() {
    highlightLinkFilters.mmOut = this.checked;
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('highlight-link-mm-in').addEventListener('change', function() {
    highlightLinkFilters.mmIn = this.checked;
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('highlight-link-me-out').addEventListener('change', function() {
    highlightLinkFilters.meOut = this.checked;
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('highlight-link-me-in').addEventListener('change', function() {
    highlightLinkFilters.meIn = this.checked;
    if (currentHighlightedNode) highlightNode(currentHighlightedNode);
});
document.getElementById('path-subfolder-levels').addEventListener('input', function() {
    pathSubfolderLevels = parseInt(this.value) || 0;
    updatePathDisplay();
});

// Check if node should be hidden by display filter
function isNodeFilteredOut(nodeData) {
    if (nodeData.type === 'module') return !displayFilters.showModules;
    if (nodeData.type === 'external') return !displayFilters.showExternal;
    if (nodeData.type === 'entity') {
        if (nodeData.entityType === 'class') return !displayFilters.showClasses;
        if (nodeData.entityType === 'function') return !displayFilters.showFunctions;
    }
    return false;
}

// Check if link should be hidden by display filter
function isLinkFilteredOut(linkData) {
    if (linkData.type === 'module-module') return !displayFilters.showLinkModule;
    if (linkData.type === 'module-entity') return !displayFilters.showLinkEntity;
    if (linkData.type === 'dependency') return !displayFilters.showLinkDependency;
    return false;
}

// Update display based on filters
function updateDisplayFilters() {
    // Update node visibility
    node.classed("node-hidden", d => isNodeFilteredOut(d) || isNodeHidden(d));

    // Update label visibility
    labels.classed("label-hidden", d => isNodeFilteredOut(d) || isNodeHidden(d));

    // Update link visibility
    link.classed("link-hidden", d => {
        // First check display filter
        if (isLinkFilteredOut(d)) return true;

        // Check if connected nodes are filtered out
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        const sourceNode = graphData.nodes.find(n => n.id === sourceId);
        const targetNode = graphData.nodes.find(n => n.id === targetId);

        if (sourceNode && isNodeFilteredOut(sourceNode)) return true;
        if (targetNode && isNodeFilteredOut(targetNode)) return true;

        // Then check collapse state
        if (d.type === 'module-module') return false;
        if (sourceNode && isNodeHidden(sourceNode)) return true;
        if (targetNode && isNodeHidden(targetNode)) return true;
        if (d.type === 'module-entity' && collapsedNodes.has(sourceId)) return true;
        if (d.type === 'dependency' && collapsedNodes.has(sourceId)) return true;

        return false;
    });
}

// Add labels with dynamic positioning based on node size
const labels = g.append("g")
    .selectAll("text")
    .data(graphData.nodes)
    .join("text")
    .attr("class", d => `label ${d.type === 'module' ? 'label-module' : ''}`)
    .attr("dy", d => {
        if (d.type === "module") {
            return getNodeSize(d, 30) / 2 + 15;
        }
        return getNodeSize(d, 10) + 10;
    })
    .attr("text-anchor", "middle")
    .text(d => d.label || d.id);

// Initialize font sizes
updateFontSizes(1);

// Apply initial display filters
updateDisplayFilters();

// Node interactions
node.on("mouseover", function(event, d) {
    // Highlight connected links
    link.style("stroke-opacity", l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return (sourceId === d.id || targetId === d.id) ? 1 : 0.2;
    });

    // Count connections
    const outgoing = graphData.links.filter(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        return sourceId === d.id;
    }).length;
    const incoming = graphData.links.filter(l => {
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return targetId === d.id;
    }).length;

    tooltip
        .style("opacity", 1)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 15) + "px")
        .html(`
            <strong>${d.label || d.id}</strong><br>
            Type: ${d.entityType || d.type}<br>
            ${d.lines ? 'Lines of code: ' + d.lines + '<br>' : ''}
            ${d.fullPath ? 'Full Path: ' + d.fullPath + '<br>' : ''}
            ${d.parent ? 'Module: ' + d.parent + '<br>' : ''}
            <div class="links-info">
                <span class="links-out">Links out: ${outgoing}</span>
                <span class="links-in">Links in: ${incoming}</span>
            </div>
            ${collapsedNodes.has(d.id) ? '<em>(collapsed)</em>' : ''}
        `);
})
.on("mouseout", function() {
    link.style("stroke-opacity", 0.6);
    tooltip.style("opacity", 0);
})
.on("click", function(event, d) {
    highlightNode(d.id);
})
.on("dblclick", function(event, d) {
    if (d.type === "module" || d.type === "entity") {
        toggleCollapse(d);
    }
});

function toggleCollapse(targetNode) {
    const nodeId = targetNode.id;

    if (collapsedNodes.has(nodeId)) {
        collapsedNodes.delete(nodeId);
    } else {
        collapsedNodes.add(nodeId);
    }

    // Update node visual to show collapsed state
    node.select("rect, circle")
        .classed("collapsed", d => collapsedNodes.has(d.id));

    updateVisibility();
}

function getChildNodes(nodeId, nodeType) {
    // Get all nodes that are direct children of this node
    const children = new Set();

    if (nodeType === 'module') {
        // Module's children are entities with this module as parent
        graphData.nodes.forEach(n => {
            if (n.parent === nodeId) {
                children.add(n.id);
            }
        });
    } else if (nodeType === 'entity') {
        // Entity's children are nodes it links to via dependency
        graphData.links.forEach(l => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            if (sourceId === nodeId && l.type === 'dependency') {
                children.add(targetId);
            }
        });
    }

    return children;
}

function isNodeHidden(nodeData) {
    // Module nodes are never hidden
    if (nodeData.type === 'module') return false;

    // Check if parent module is collapsed
    if (nodeData.parent && collapsedNodes.has(nodeData.parent)) {
        return true;
    }

    // Check if this is a dependency of a collapsed entity
    for (const link of graphData.links) {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        if (targetId === nodeData.id && link.type === 'dependency') {
            // Check if source entity is collapsed or hidden
            const sourceNode = graphData.nodes.find(n => n.id === sourceId);
            if (sourceNode) {
                if (collapsedNodes.has(sourceId)) return true;
                if (sourceNode.parent && collapsedNodes.has(sourceNode.parent)) return true;
            }
        }
    }

    return false;
}

function updateVisibility() {
    // Use updateDisplayFilters which handles both collapse state and display filters
    updateDisplayFilters();
}

// Simulation tick
simulation.on("tick", () => {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x},${d.y})`);

    labels
        .attr("x", d => d.x)
        .attr("y", d => d.y);
});

// Drag functions - nodes stay where you drag them
function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    // Keep node at dragged position (don't reset fx/fy to null)
    // Double-click to release node back to simulation
}

// Initial zoom to fit content
function zoomToFit() {
    // Calculate bounds for ALL nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    graphData.nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const padding = 100;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    // Calculate scale to fit all nodes
    const fitScale = Math.min(width / graphWidth, height / graphHeight);

    // For larger graphs (>20 nodes), zoom out more aggressively
    const nodeCount = graphData.nodes.length;
    let maxZoom = 0.7;
    if (nodeCount > 20) {
        // Reduce max zoom based on node count: 0.7 -> down to 0.4 for 120+ nodes
        maxZoom = Math.max(0.4, 0.7 - (nodeCount - 20) * 0.003);
    }

    const scale = Math.min(fitScale * 0.85, maxZoom);

    svg.transition()
        .duration(500)
        .call(zoom.transform, d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-centerX, -centerY));
}

simulation.on("end", () => {
    if (initialZoomDone) return;
    // Disabled: zoomToFit();
    initialZoomDone = true;
});

// ==================== SEARCH FUNCTIONALITY ====================

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const autocompleteList = document.getElementById('autocompleteList');

// Navigation history
let highlightHistory = [];
let historyIndex = -1;
let isNavigating = false; // Flag to prevent adding to history during navigation

const backButton = document.getElementById('backButton');
const forwardButton = document.getElementById('forwardButton');

function updateNavigationButtons() {
    backButton.disabled = historyIndex <= 0;
    forwardButton.disabled = historyIndex >= highlightHistory.length - 1;
}

function addToHistory(nodeId) {
    if (isNavigating) return; // Don't add to history during back/forward navigation
    
    // Remove any forward history when a new node is selected
    highlightHistory = highlightHistory.slice(0, historyIndex + 1);
    
    // Add new node (avoid duplicates of the same node in a row)
    if (highlightHistory[historyIndex] !== nodeId) {
        highlightHistory.push(nodeId);
        historyIndex++;
    }
    
    updateNavigationButtons();
}

function navigateBack() {
    if (historyIndex > 0) {
        isNavigating = true;
        historyIndex--;
        const nodeId = highlightHistory[historyIndex];
        highlightNode(nodeId);
        isNavigating = false;
        updateNavigationButtons();
    }
}

function navigateForward() {
    if (historyIndex < highlightHistory.length - 1) {
        isNavigating = true;
        historyIndex++;
        const nodeId = highlightHistory[historyIndex];
        highlightNode(nodeId);
        isNavigating = false;
        updateNavigationButtons();
    }
}

backButton.addEventListener('click', navigateBack);
forwardButton.addEventListener('click', navigateForward);

// Keyboard shortcuts for navigation
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateBack();
    } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigateForward();
    }
});


let selectedAutocompleteIndex = -1;
let currentHighlightedNode = null;
let maxHighlightFontSize = 256;
let iconWireScaleFactor = 1.0;
let currentScale = 1;
let filteredNodes = [];
let highlightFocusMode = false;
let highlightLinkFilters = {
    mmOut: true,
    mmIn: false,
    meOut: true,
    meIn: false
};
let showHighlightedPath = true;
let pathSubfolderLevels = 0;

// Build searchable index
const searchIndex = graphData.nodes.map(n => ({
    id: n.id,
    label: n.label || n.id,
    type: n.type,
    parent: n.parent || null,
    fullPath: n.fullPath || null,
    // For modules, include both 'modulename' and 'modulename.py' as separate searchable terms, plus imports
    // For entities, search by label and parent
    searchText: n.type === 'module' 
        ? (n.label || n.id).toLowerCase() + ' ' + 
          (n.label || n.id).toLowerCase() + '.py ' + 
          (n.fullPath || '').toLowerCase() + ' ' +
          ((n.imports || []).join(' ')).toLowerCase()
        : ((n.label || n.id) + ' ' + (n.parent || '')).toLowerCase()
}));

// Get connected nodes for a given node
function getConnectedNodes(nodeId) {
    const connected = new Set();
    connected.add(nodeId);

    graphData.links.forEach(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;

        if (sourceId === nodeId) {
            connected.add(targetId);
        }
        if (targetId === nodeId) {
            connected.add(sourceId);
        }
    });

    return connected;
}

// Get connected links for a given node
function getConnectedLinks(nodeId) {
    return graphData.links.filter(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return sourceId === nodeId || targetId === nodeId;
    });
}

// Zoom to fit a set of nodes
function zoomToFitNodes(nodeIds) {
    if (nodeIds.size === 0) return;

    // Calculate bounds for the specified nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    graphData.nodes.forEach(n => {
        if (nodeIds.has(n.id)) {
            minX = Math.min(minX, n.x);
            maxX = Math.max(maxX, n.x);
            minY = Math.min(minY, n.y);
            maxY = Math.max(maxY, n.y);
        }
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const padding = 150; // More padding for highlight mode
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    // Calculate scale to fit all nodes
    const fitScale = Math.min(width / graphWidth, height / graphHeight);

    // Limit max zoom to avoid zooming too close
    const maxZoom = 1.5;
    const scale = Math.min(fitScale * 0.9, maxZoom);

    svg.transition()
        .duration(500)
        .call(zoom.transform, d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-centerX, -centerY));
}

// Highlight a node and its connections
function highlightNode(nodeId) {
    // Add to history (unless we're navigating)
    addToHistory(nodeId);
    
    // In focus mode, build chain from ALL dependency links
    // In normal mode, use filtered links based on highlight settings
    const connectedLinks = highlightFocusMode 
        ? graphData.links.filter(d => {
            const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
            const targetId = typeof d.target === 'object' ? d.target.id : d.target;
            return sourceId === nodeId || targetId === nodeId;
          })
        : graphData.links.filter(d => isLinkHighlighted(d, nodeId));
    
    const connectedNodes = new Set();
    connectedLinks.forEach(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        if (sourceId !== nodeId) connectedNodes.add(sourceId);
        if (targetId !== nodeId) connectedNodes.add(targetId);
    });
    currentHighlightedNode = nodeId;

    if (highlightFocusMode) {
        // Focus mode: show all chain nodes (ignore filters), hide background nodes completely
        node.each(function(d) {
            const el = d3.select(this);
            if (d.id === nodeId) {
                el.classed('dimmed', false)
                  .classed('highlighted', false)
                  .classed('highlighted-main', true)
                  .classed('node-hidden', false);
            } else if (connectedNodes.has(d.id)) {
                // Check if this node should be highlighted or dimmed
                const shouldHighlight = connectedLinks.some(l => {
                    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                    return (sourceId === d.id || targetId === d.id) && isLinkHighlighted(l, nodeId);
                });
                el.classed('dimmed', !shouldHighlight)
                  .classed('highlighted', shouldHighlight)
                  .classed('highlighted-main', false)
                  .classed('node-hidden', false);
            } else {
                // Background nodes - completely hidden
                el.classed('dimmed', false)
                  .classed('highlighted', false)
                  .classed('highlighted-main', false)
                  .classed('node-hidden', true);
            }
        });
    } else {
        // Normal mode: respect filters, only dim background
        // First, clear node-hidden from all nodes to undo focus mode
        node.classed('node-hidden', d => isNodeFilteredOut(d) || isNodeHidden(d));
        
        // Then apply highlight classes only to visible nodes
        node.filter(d => !isNodeFilteredOut(d) && !isNodeHidden(d))
            .classed('dimmed', d => d.id !== nodeId && !connectedNodes.has(d.id))
            .classed('highlighted', d => connectedNodes.has(d.id) && d.id !== nodeId)
            .classed('highlighted-main', d => d.id === nodeId);
    }

    // Update links
    if (highlightFocusMode) {
        // Focus mode: show only links between chain nodes
        link.each(function(d) {
            const el = d3.select(this);
            const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
            const targetId = typeof d.target === 'object' ? d.target.id : d.target;
            const sourceInChain = sourceId === nodeId || connectedNodes.has(sourceId);
            const targetInChain = targetId === nodeId || connectedNodes.has(targetId);
            
            if (sourceInChain && targetInChain) {
                // Link is part of the chain
                const isHighlighted = isLinkHighlighted(d, nodeId);
                el.classed('dimmed', !isHighlighted)
                  .classed('highlighted', isHighlighted)
                  .classed('link-hidden', false)
                  .style('stroke-opacity', isHighlighted ? 1 : 0.4);
            } else {
                // Background link - completely hidden
                el.classed('dimmed', false)
                  .classed('highlighted', false)
                  .classed('link-hidden', true)
                  .style('stroke-opacity', null);
            }
        });
    } else {
        // Normal mode: filter out links connected to hidden nodes
        // First, clear any inline stroke-opacity styles from focus mode
        link.style('stroke-opacity', null);
        
        link.filter(d => {
                // First check if the link type is filtered out
                if (isLinkFilteredOut(d)) return false;
                
                const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                const sourceNode = graphData.nodes.find(n => n.id === sourceId);
                const targetNode = graphData.nodes.find(n => n.id === targetId);
                const sourceVisible = sourceNode && !isNodeFilteredOut(sourceNode) && !isNodeHidden(sourceNode);
                const targetVisible = targetNode && !isNodeFilteredOut(targetNode) && !isNodeHidden(targetNode);
                return sourceVisible && targetVisible;
            })
            .classed('dimmed', d => !isLinkHighlighted(d, nodeId))
            .classed('highlighted', d => isLinkHighlighted(d, nodeId));
        
        // Reapply link-hidden to ALL links to ensure hidden links stay hidden (normal mode only)
        link.classed('link-hidden', d => {
            if (isLinkFilteredOut(d)) return true;
            const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
            const targetId = typeof d.target === 'object' ? d.target.id : d.target;
            const sourceNode = graphData.nodes.find(n => n.id === sourceId);
            const targetNode = graphData.nodes.find(n => n.id === targetId);
            if (sourceNode && isNodeFilteredOut(sourceNode)) return true;
            if (targetNode && isNodeFilteredOut(targetNode)) return true;
            if (d.type === 'module-module') return false;
            if (sourceNode && isNodeHidden(sourceNode)) return true;
            if (targetNode && isNodeHidden(targetNode)) return true;
            if (d.type === 'module-entity' && collapsedNodes.has(sourceId)) return true;
            if (d.type === 'dependency' && collapsedNodes.has(sourceId)) return true;
            return false;
        });
    }

    // Update labels
    if (highlightFocusMode) {
        // Focus mode: show all chain labels (ignore filters), hide background labels
        labels.each(function(d) {
            const el = d3.select(this);
            const nodeEl = node.filter(n => n.id === d.id);
            const isNodeDimmed = nodeEl.classed('dimmed');
            
            if (d.id === nodeId || connectedNodes.has(d.id)) {
                el.classed('dimmed', isNodeDimmed)
                  .classed('highlighted-label', !isNodeDimmed)
                  .classed('label-hidden', false);
            } else {
                el.classed('dimmed', false)
                  .classed('highlighted-label', false)
                  .classed('label-hidden', true);
            }
        });
    } else {
        // Normal mode: respect filters
        // First, clear label-hidden from all labels and reapply based on filters
        labels.classed('label-hidden', d => isNodeFilteredOut(d) || isNodeHidden(d));
        
        // Then apply highlight classes only to visible labels
        labels.filter(d => !isNodeFilteredOut(d) && !isNodeHidden(d))
            .classed('dimmed', d => d.id !== nodeId && !connectedNodes.has(d.id))
            .classed('highlighted-label', d => d.id === nodeId || connectedNodes.has(d.id));
    }

    // Zoom to fit all connected nodes
    zoomToFitNodes(connectedNodes);
    updateIconWireSizes(currentScale);
    updatePathDisplay();
}

// Clear all highlighting
function clearHighlight() {
    currentHighlightedNode = null;

    // Clear highlight classes from all nodes and restore filter state
    node.classed('dimmed', false)
        .classed('highlighted', false)
        .classed('highlighted-main', false);
    
    // Restore node-hidden based on filters
    node.classed('node-hidden', d => isNodeFilteredOut(d) || isNodeHidden(d));

    link.classed('dimmed', false)
        .classed('highlighted', false);

    // Clear highlight classes from all labels and restore filter state
    labels.classed('dimmed', false)
        .classed('highlighted-label', false);
    
    // Restore label-hidden based on filters
    labels.classed('label-hidden', d => isNodeFilteredOut(d) || isNodeHidden(d));
    
    // Restore display filters
    updateDisplayFilters();

    searchInput.value = '';
    searchClear.classList.remove('visible');
    hideAutocomplete();
    updateIconWireSizes(currentScale);
    updatePathDisplay();
}

// Filter nodes based on search query
function filterNodes(query) {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    const results = searchIndex.filter(n => n.searchText.includes(lowerQuery));
    
    // Sort results: prioritize exact label matches, then label starts with query, then path matches
    results.sort((a, b) => {
        const aLabel = (a.label || a.id).toLowerCase();
        const bLabel = (b.label || b.id).toLowerCase();
        const aLabelWithPy = aLabel + '.py';
        const bLabelWithPy = bLabel + '.py';
        
        // Exact matches come first
        if (aLabel === lowerQuery || aLabelWithPy === lowerQuery) return -1;
        if (bLabel === lowerQuery || bLabelWithPy === lowerQuery) return 1;
        
        // Label starts with query comes next
        const aStarts = aLabel.startsWith(lowerQuery) || aLabelWithPy.startsWith(lowerQuery);
        const bStarts = bLabel.startsWith(lowerQuery) || bLabelWithPy.startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        // Label contains query comes before path contains query
        const aLabelContains = aLabel.includes(lowerQuery) || aLabelWithPy.includes(lowerQuery);
        const bLabelContains = bLabel.includes(lowerQuery) || bLabelWithPy.includes(lowerQuery);
        if (aLabelContains && !bLabelContains) return -1;
        if (!aLabelContains && bLabelContains) return 1;
        
        // Otherwise alphabetical
        return aLabel.localeCompare(bLabel);
    });
    
    return results.slice(0, 50); // Limit to 50 results
}

// Render autocomplete list
function renderAutocomplete(results) {
    if (results.length === 0) {
        hideAutocomplete();
        return;
    }

    filteredNodes = results;
    selectedAutocompleteIndex = -1;

    autocompleteList.innerHTML = results.map((n, i) => {
        // For modules, show fullPath; for entities, show parent
        const pathInfo = n.type === 'module' && n.fullPath 
            ? `<span class="node-parent">${n.fullPath}</span>`
            : n.parent ? `<span class="node-parent">${n.parent}</span>` : '';
        
        return `
            <div class="autocomplete-item" data-index="${i}" data-id="${n.id}">
                <span class="node-type ${n.type}">${n.type}</span>
                <span class="node-name">${n.label}</span>
                ${pathInfo}
            </div>
        `;
    }).join('');

    autocompleteList.classList.add('visible');

    // Add click handlers
    autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            selectNode(item.dataset.id);
        });
    });
}

// Hide autocomplete
function hideAutocomplete() {
    autocompleteList.classList.remove('visible');
    filteredNodes = [];
    selectedAutocompleteIndex = -1;
}

// Select a node from autocomplete
function selectNode(nodeId) {
    const nodeData = searchIndex.find(n => n.id === nodeId);
    if (nodeData) {
        searchInput.value = nodeData.label;
        hideAutocomplete();
        highlightNode(nodeId);
    }
}

// Update selected item in autocomplete
function updateSelectedItem() {
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === selectedAutocompleteIndex);
    });

    // Scroll into view
    if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
        items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
    }
}

// Search input event handlers
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    searchClear.classList.toggle('visible', query.length > 0);

    if (query.length > 0) {
        const results = filterNodes(query);
        renderAutocomplete(results);
    } else {
        hideAutocomplete();
    }
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredNodes.length > 0) {
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, filteredNodes.length - 1);
            updateSelectedItem();
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredNodes.length > 0) {
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
            updateSelectedItem();
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedAutocompleteIndex >= 0 && filteredNodes[selectedAutocompleteIndex]) {
            selectNode(filteredNodes[selectedAutocompleteIndex].id);
        } else if (filteredNodes.length > 0) {
            selectNode(filteredNodes[0].id);
        }
    } else if (e.key === 'Escape') {
        if (autocompleteList.classList.contains('visible')) {
            hideAutocomplete();
        } else {
            clearHighlight();
        }
        searchInput.blur();
    }
});

searchInput.addEventListener('focus', () => {
    const query = searchInput.value.trim();
    if (query.length > 0) {
        const results = filterNodes(query);
        renderAutocomplete(results);
    }
});

// Clear button
searchClear.addEventListener('click', () => {
    clearHighlight();
});

// Close autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        hideAutocomplete();
    }
});

// Keyboard shortcut to focus search (Ctrl+F or Cmd+F)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
    if (e.key === 'Escape' && currentHighlightedNode) {
        clearHighlight();
    }
});

// Orphan modules click handler - navigate to module node
document.querySelectorAll('#unlinked-list li').forEach(li => {
    li.addEventListener('click', () => {
        const moduleId = li.dataset.moduleId;
        const targetNode = graphData.nodes.find(n => n.id === moduleId);
        if (targetNode) {
            // Zoom and pan to the node
            const scale = 1.5;
            svg.transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity
                    .translate(width / 2 - targetNode.x * scale, height / 2 - targetNode.y * scale)
                    .scale(scale));

            // Highlight the node temporarily
            node.selectAll("rect, circle")
                .style("filter", n => n.id === moduleId ? "brightness(2) drop-shadow(0 0 10px #ff9800)" : "none");

            // Reset highlight after 2 seconds
            setTimeout(() => {
                node.selectAll("rect, circle").style("filter", "none");
            }, 2000);
        }
    });
});
