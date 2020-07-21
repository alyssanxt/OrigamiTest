/*
 * TODO:
 *   - cleanup after http://bugs.dojotoolkit.org/ticket/10885 resolved
 *     (see xxx below)
 *   - switch to Silverlight after http://bugs.dojotoolkit.org/ticket/10886
 *     resolved
 *   - crop boundary to half way (?) to reduce complexity
 *   - drag to pan/zoom crease pattern
 *   - auto sizing of three UI widgets on screen (in particular for phone)
 *     - try new dojo.window.getBox?
 *   - option of printing things other than crease pattern?
 *     (pagebreak_attempt.html didn't work...)
 *   - doesn't work in IE
 * OLD now resolved:
 *   - 3D doesn't work on Android: http://bugs.dojotoolkit.org/ticket/10887
 *
 * http://archive.dojotoolkit.org/nightly/dojotoolkit/dojox/gfx3d/tests/test_cylinder.html
 */

dojo.require ('dojox.gfx');
dojo.require ('dojox.gfx3d');
//dojo.require("dijit.form.NumberTextBox");
//dojo.require("dojo.parser");
//dojo.addOnLoad (function () { dojo.parser.parse (); });

var nx = 6, ny = 5, oldnx, oldny;
var channel = 1, oldchannel;
var maze_is_text = false;
var maze, mazeg, mazel, cp, cpg, d3, d3v, d3u, d3on = true, front3, front3g, fron3l;

dojo.addOnLoad (function () {
  if (dojox.gfx.renderer == "vml") {
    dojo.byId('warnings').innerHTML = '<i>You are using Internet Explorer, ' +
      'which currently will render this web application rather poorly under ' +
      'VML.  Namely, it is very slow, thick lines are not very thick, and ' +
      'dragging the 3D view does not work.  Soon I will add Silverlight ' +
      'support which will fix the problem.  Meanwhile, please use another ' +
      'browser like Chrome, Firefox, or Safari.</i>';
    dojo.byId('warnings').style.display = 'block';
  }
  if (dojox.gfx.renderer == 'canvas') { //navigator.userAgent.toLowerCase().indexOf('android') >= 0) {
    dojo.byId('warnings').innerHTML = '<i>You are using Canvas instead of ' +
      'SVG (e.g., on older versions of Android), which currently cannot ' +
      'render the rotating 3D view of the maze.  If you want that feature, ' +
      'try another browser.</i>';
    dojo.byId('warnings').style.display = 'block';
    d3on = false;
  }

  maze = dojox.gfx.createSurface (dojo.byId ('maze'), 500, 400);
  cp = dojox.gfx.createSurface (dojo.byId ('cp'), 800, 600);

  if (d3on) {
    d3 = dojox.gfx.createSurface (dojo.byId ('d3'), 400, 300);
    d3v = d3.createViewport ();
    d3v.setLights([
      {direction: {x: 0, y: 0, z: -10}, color: "white"}
    ], {color: "white", intensity: 2}, "white");
  }
  front3 = dojox.gfx.createSurface (dojo.byId ('front3'), 400, 300);

  update_nx_ny ();

  dojo.connect (dojo.byId ('maze'), 'onclick', toggle_edge);
  dojo.connect (dojo.byId ('lock0'), 'onclick', update_maze);
  dojo.connect (dojo.byId ('front'), 'onclick', front_or_d3);
  dojo.forEach (['oninput', 'onpropertychange', 'keyup'], function (event) {
    dojo.connect (dojo.byId ('text'), event, function (event) {
      setTimeout (text_to_maze, 0);
      return true;
    });
    dojo.connect (dojo.byId ('channel'), event, function (event) {
      setTimeout (check_channel, 0);
      return true;
    });
  });

  // 3D view dragging:
  if (d3on) {
    dojo.connect (dojo.byId ('d3'), 'onmousedown', d3down);
    // The sad story: We don't get mouseup outside of the window.  I couldn't
    // find a way for mousemove to detect that button is no longer pressed.
    // So we ought to treat mouseout as mouseup.  But periodically someone seems
    // to generate quick mouseout/mouseover pairs.  So we make sure a mouseout
    // isn't followed by a mouseover within 1/3 of a second.
    dojo.connect (window, 'onmouseout', maybe_out);
    dojo.connect (window, 'onmouseover', not_out);
    // Cancel text selection and text dragging (from circles.html demo):
    dojo.connect (dojo.byId ('d3'), 'ondragstart',   dojo, 'stopEvent');
    dojo.connect (dojo.byId ('d3'), 'onselectstart', dojo, 'stopEvent');
  } else {
    dojo.byId ('front').checked = true;
    dojo.byId ('front').disabled = true;
    front_or_d3 ();
  }

  // Parse query part of URL, based on
  // http://stackoverflow.com/questions/3834096/dojo-pass-url-parameter-into-ajax
  var q = dojo.queryToObject (window.location.search.slice (1));
  // from http://bugs.dojotoolkit.org/ticket/7384
  if ('lock0' in q)
    dojo.byId ('lock0').checked = true;
  if ('front' in q) {
    dojo.byId ('front').checked = true;
    front_or_d3 ();
  }
  if ('channel' in q)
    set_channel (q.channel);
  if ('text' in q) {
    dojo.byId ('text').value = q.text;
    text_to_maze ();
  } else if ('maze' in q) {
    deflatten_maze (q.maze);
  }
});

var scale, xoff, yoff;

function coord (x, y) {
  return [x * scale + xoff, y * scale + yoff];
}

window.thin = 0.09;
window.medium = 0.15;
window.thick = 0.3;
//var thin = 0.09, medium = 0.15, thick = 0.3;
var margin = thick;
var edge_top = null, edge_left = null;
var NOTHING = 0, WALL = 1;
var d3xang = -45, d3yang = 45;
//var front3eps = 0.1, front3off = 0.5;
window.front3eps = 0.1;
window.front3off = 0.5;

function update_nx_ny (no_update, shiftX, shiftY) {
  // Prevent extra updates.
  if (oldnx == nx && oldny == ny) return;
  oldnx = nx;
  oldny = ny;

  if (!shiftX) shiftX = 0;
  if (!shiftY) shiftY = 0;

  // Update user feedback.
  dojo.byId ('nx').innerHTML = nx;
  dojo.byId ('ny').innerHTML = ny;

  // Create maze array.
  var old_top = edge_top, old_left = edge_left;
  edge_top = [];
  edge_left = [];
  for (var x = 0; x <= nx; x++) {
    edge_top[x] = [];
    edge_left[x] = [];
    for (var y = 0; y <= ny; y++) {
      if (old_top != null && x-shiftX >= 0 && x-shiftX < old_top.length && y-shiftY < old_top[x-shiftX].length) {
        edge_top[x][y] = old_top[x-shiftX][y-shiftY];
        edge_left[x][y] = old_left[x-shiftX][y-shiftY];
      } else {
        edge_top[x][y] = NOTHING;
        edge_left[x][y] = NOTHING;
      }
    }
  }

  // Precompute graphical scale.
  var dims = maze.getDimensions ();
  // xxx hack for Silverlight
  dims.width = 500; dims.height = 400;
  scale = Math.min (dims.width / (nx+margin), dims.height / (ny+margin));
  xoff = (dims.width - scale * nx) / 2;
  yoff = (dims.height - scale * ny) / 2;
  maze.clear ();
  mazeg = maze.createGroup ();
  mazeg.setTransform ([
    dojox.gfx.matrix.translate (xoff, yoff),
    dojox.gfx.matrix.scale (scale, scale)
  ]);

  var front3dims = front3.getDimensions ();
  // xxx hack for Silverlight
  front3dims.width = 400; front3dims.height = 300;
  var front3margin = front3off + front3eps + thick;
  var front3scale = Math.min (front3dims.width / (nx+2*front3margin),
                              front3dims.height / (ny+2*front3margin));
  var front3xoff = (front3dims.width - front3scale * nx) / 2;
  var front3yoff = (front3dims.height - front3scale * ny) / 2;
  front3.clear ();
  front3g = front3.createGroup ();
  front3g.setTransform ([
    dojox.gfx.matrix.translate (front3xoff, front3yoff),
    dojox.gfx.matrix.scale (front3scale, front3scale)
  ]);

  update_cpscale ();

  // Draw underlying grid.
  var stroke = {color: "gray", width: thin, cap: 'round'};
  for (var x = 0; x <= nx; x++) {
    mazeg.createLine ({x1: x, x2: x, y1: 0, y2: ny}).setStroke (stroke);
  }
  for (var y = 0; y <= ny; y++) {
    mazeg.createLine ({y1: y, y2: y, x1: 0, x2: nx}).setStroke (stroke);
  }
  mazel = mazeg.createGroup ();

  // 3D
  if (d3on) {
    d3view (true);
    d3v.clear ();
    d3v.objects = [];
    var d3g = d3v.createScene ();
    d3g.createPolygon ([{x: nx/2, y: ny/2, z: -1000000}]);
    for (var x = 0; x < nx; x++) {
      for (var y = 0; y < ny; y++) {
        d3g.createPolygon ([{x: x, y: y, z: 0}, {x: x+1, y: y, z: 0},
                            {x: x+1, y: y+1, z: 0}, {x: x, y: y+1, z: 0}])
         .setFill ({color: "#c0c0c0", type: "constant", finish: "glossy"})
         .setStroke ("blue");
      }
    }
    d3u = d3v.createScene ();
  }
  for (var x = 0; x < nx; x++) {
    for (var y = 0; y < ny; y++) {
      front3g.createRect ({x: x, y: y, width: 1, height: 1})
       .setFill ("#c0c0c0")
       .setStroke ({color: "blue", width: thin});
    }
  }
  front3l = front3g.createGroup ();

  if (!no_update)
    update_maze ();
}

function update_cpscale () {
  var cpdims = cp.getDimensions ();
  var hg = 2 + channel, gadget = 2 * hg;
  // xxx hack for Silverlight
  cpdims.width = 800; cpdims.height = 600;
  var cpscale = Math.min (cpdims.width / (nx+1+margin),
                          cpdims.height / (ny+1+margin));
  var cpxoff = (cpdims.width - cpscale * (nx+1)) / 2;
  var cpyoff = (cpdims.height - cpscale * (ny+1)) / 2;
  cp.clear ();
  cpg = cp.createGroup ();
  cpg.setTransform ([
    dojox.gfx.matrix.translate (cpxoff, cpyoff),
    dojox.gfx.matrix.scale (cpscale / gadget, cpscale / gadget),
    dojox.gfx.matrix.translate (hg, hg)
  ]);
}

function d3view (no_render) {
  var d3dims = d3.getDimensions ();
  // xxx hack for Silverlight
  d3dims.width = 400; d3dims.height = 300;
  var d3scale = Math.min (d3dims.width, d3dims.height) /
                Math.sqrt (nx*nx+ny*ny);  // xxx this is approximate
  d3v.setCameraTransform ([
    dojox.gfx3d.matrix.translate (d3dims.width/2, d3dims.height/2, 0),
    dojox.gfx3d.matrix.scale (d3scale),
    dojox.gfx3d.matrix.cameraRotateXg (d3xang),
    dojox.gfx3d.matrix.cameraRotateZg (d3yang),
    dojox.gfx3d.matrix.translate (-nx/2,-ny/2,0)
  ]);
  if (!no_render)
    d3render ();
}

function d3render () {
  d3v.clear ();
  d3v.render ();
}

var version = 0;

function update_maze () {
  version++;
  var this_version = version;

  // Redraw input grid.
  mazel.clear ();
  var stroke = {color: "black", width: thick, cap: 'round'};
  for (var x = 0; x <= nx; x++) {
    for (var y = 0; y <= ny; y++) {
      if (x < nx && edge_top[x][y])
        mazel.createLine ({x1: x, x2: x+1, y1: y, y2: y}).setStroke (stroke);
      if (y < ny && edge_left[x][y])
        mazel.createLine ({x1: x, x2: x, y1: y, y2: y+1}).setStroke (stroke);
    }
  }

  // Update link.
  link_to_self ();

  // Redraw 3D rendering.
  if (d3on) {
    d3u.objects = [];
    var zmax = 1.0 / channel;
    //for (var x = 0; x <= nx; x++) {
    function draw_d3 (x) {
      if (version != this_version) return;
      for (var y = 0; y <= ny; y++) {
        if (x < nx && edge_top[x][y])
          d3u.createPolygon ([{x: x, y: ny-y, z: 0}, {x: x+1, y: ny-y, z: 0},
                              {x: x+1, y: ny-y, z: zmax}, {x: x, y: ny-y, z: zmax}])
            .setFill ({color: "yellow", type: "constant", finish: "glossy"})
            .setStroke ("black");
        if (y < ny && edge_left[x][y])
          d3u.createPolygon ([{x: x, y: ny-y, z: 0}, {x: x, y: ny-(y+1), z: 0},
                              {x: x, y: ny-(y+1), z: zmax}, {x: x, y: ny-y, z: zmax}])
            .setFill ({color: "yellow", type: "constant", finish: "glossy"})
            .setStroke ("black");
      }
      if (x < nx)
        setTimeout (function () { draw_d3 (x+1) }, 0);
      else {
        d3view ();  // d3render() has trouble with gfx3d smarts and empty mazes
        //setTimeout (function () { draw_cp (0) }, 0);
      }
    }
    setTimeout (function () { draw_d3 (0) }, 0);
  }
  front3l.clear ();
  var off = front3off / channel;
  function draw_front3 (y) {
    if (version != this_version) return;
    // Horizontal segments, back (upper) face
    for (var x = 0; x < nx; x++)
      if (edge_top[x][y]) {
        var extend1 = (y > 0 && edge_left[x][y-1] ? -1 :
                       (x > 0 && edge_top[x-1][y] ? 0 : 1)),
            extend2 = (y > 0 && edge_left[x+1][y-1] ? -1 :
                       (x < nx-1 && edge_top[x+1][y] ? 0 : 1));
        front3l.createPolyline ([
            {x: x-extend1*front3eps, y: y-front3eps},
            {x: x+extend2*front3eps+1, y: y-front3eps},
            {x: x+extend2*front3eps+1+off, y: y-front3eps-off},
            {x: x-extend1*front3eps+off, y: y-front3eps-off},
            {x: x-extend1*front3eps, y: y-front3eps}])
          .setFill ("yellow")
          .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
      }
    for (var x = 0; x < nx; x++) {
      // Left slivers for horizontal segments
      if (edge_top[x][y] && !(x > 0 && edge_top[x-1][y]) &&
          !edge_left[x][y] && !(y > 0 && edge_left[x][y-1]))
        front3l.createPolyline ([
            {x: x-front3eps, y: y+front3eps},
            {x: x-front3eps+off, y: y+front3eps-off},
            {x: x-front3eps+off, y: y-front3eps-off},
            {x: x-front3eps, y: y-front3eps},
            {x: x-front3eps, y: y+front3eps}])
          .setFill ("yellow")
          .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
      // Right slivers for horizontal segments
      if (edge_top[x][y] && !(x < nx-1 && edge_top[x+1][y]) &&
          !edge_left[x+1][y] && !(y > 0 && edge_left[x+1][y-1]))
        front3l.createPolyline ([
            {x: x+1+front3eps, y: y+front3eps},
            {x: x+1+front3eps+off, y: y+front3eps-off},
            {x: x+1+front3eps+off, y: y-front3eps-off},
            {x: x+1+front3eps, y: y-front3eps},
            {x: x+1+front3eps, y: y+front3eps}])
          .setFill ("yellow")
          .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
    }
    // Horizontal segments, front (lower) face
    for (var x = 0; x < nx; x++)
      if (edge_top[x][y]) {
        var extend1 = (y < ny && edge_left[x][y] ? -1 :
                       (x > 0 && edge_top[x-1][y] ? 0 : 1)),
            extend2 = (y < ny && edge_left[x+1][y] ? -1 :
                       (x < nx-1 && edge_top[x+1][y] ? 0 : 1));
        front3l.createPolyline ([
            {x: x-extend1*front3eps, y: y+front3eps},
            {x: x+extend2*front3eps+1, y: y+front3eps},
            {x: x+extend2*front3eps+1+off, y: y+front3eps-off},
            {x: x-extend1*front3eps+off, y: y+front3eps-off},
            {x: x-extend1*front3eps, y: y+front3eps}])
          .setFill ("yellow")
          .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
      }
    if (y < ny) {
      // Top (back) slivers for vertical segments
      for (var x = 0; x <= nx; x++)
        if (edge_left[x][y] && !(y > 0 && edge_left[x][y-1]) &&
            !edge_top[x][y] && !(x > 0 && edge_top[x-1][y]))
          front3l.createPolyline ([
              {x: x-front3eps, y: y-front3eps},
              {x: x-front3eps+off, y: y-front3eps-off},
              {x: x+front3eps+off, y: y-front3eps-off},
              {x: x+front3eps, y: y-front3eps},
              {x: x-front3eps, y: y-front3eps}])
            .setFill ("yellow")
            .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
      for (var x = 0; x <= nx; x++)
        if (edge_left[x][y]) {
          // Vertical segments, back (right) face
          var extend1 = (x < nx && edge_top[x][y] ? -1 :
                         (y > 0 && edge_left[x][y-1] ? 0 : 1)),
              extend2 = (x < nx && edge_top[x][y+1] ? -1 :
                         (y < ny-1 && edge_left[x][y+1] ? 0 : 1));
          front3l.createPolyline ([
              {x: x+front3eps, y: y-extend1*front3eps},
              {x: x+front3eps, y: y+extend2*front3eps+1},
              {x: x+front3eps+off, y: y+extend2*front3eps+1-off},
              {x: x+front3eps+off, y: y-extend1*front3eps-off},
              {x: x+front3eps, y: y-extend1*front3eps}])
            .setFill ("yellow")
            .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
          // Vertical segments, front (left) face
          var extend1 = (x > 0 && edge_top[x-1][y] ? -1 :
                         (y > 0 && edge_left[x][y-1] ? 0 : 1)),
              extend2 = (x > 0 && edge_top[x-1][y+1] ? -1 :
                         (y < ny-1 && edge_left[x][y+1] ? 0 : 1));
          front3l.createPolyline ([
              {x: x-front3eps, y: y-extend1*front3eps},
              {x: x-front3eps, y: y+extend2*front3eps+1},
              {x: x-front3eps+off, y: y+extend2*front3eps+1-off},
              {x: x-front3eps+off, y: y-extend1*front3eps-off},
              {x: x-front3eps, y: y-extend1*front3eps}])
            .setFill ("yellow")
            .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
        }
      // Bottom (front) slivers for vertical segments
      for (var x = 0; x <= nx; x++)
        if (edge_left[x][y] && !(y-1 < ny && edge_left[x][y+1]) &&
            !edge_top[x][y+1] && !(x > 0 && edge_top[x-1][y+1]))
          front3l.createPolyline ([
              {x: x-front3eps, y: y+1+front3eps},
              {x: x-front3eps+off, y: y+1+front3eps-off},
              {x: x+front3eps+off, y: y+1+front3eps-off},
              {x: x+front3eps, y: y+1+front3eps},
              {x: x-front3eps, y: y+1+front3eps}])
            .setFill ("pink")
            .setStroke ({color: "black", width: thin, join: 'round', cap: 'round'});
    }
    if (y < ny)
      setTimeout (function () { draw_front3 (y+1) }, 0);
    else // Final round
      for (var y = 0; y <= ny; y++) {
        // Front slivers, horizontal
        for (var x = 0; x <= nx; x++)
          if (edge_top[x][y])
            front3l.createRect ({
              x: x-front3eps+off+thin/2,
              y: y-off-front3eps+thin/2,
              width: 1-thin+2*front3eps,
              height: 2*front3eps-thin})
            .setFill ("yellow");
        // Front slivers, vertical
        if (y < ny)
          for (var x = 0; x <= nx; x++)
            if (edge_left[x][y])
              front3l.createRect ({
                x: x+off-front3eps+thin/2,
                y: y-front3eps-off+thin/2,
                width: 2*front3eps-thin,
                height: 1-thin+2*front3eps})
              .setFill ("yellow");
      }
  }
  setTimeout (function () { draw_front3 (0) }, 0);

  // Redraw crease pattern.
  cpg.clear ();
  var hg = 2 + channel, gadget = 2 * hg;
  cpg.createRect ({x: -hg, y: -hg,
                   width: gadget*(nx+1), height: gadget*(ny+1)})
    .setStroke ({color: "black", width: thick, join: 'round'});
  var valley90 = {color: "#3030f0", width: thin, cap: 'round'};
  var valley180 = {color: "#0000f0", width: medium, cap: 'round'};
  var mountain90 = {color: "#ff8080", width: thin, cap: 'round'};
  var mountain180 = {color: "#ff6060", width: medium, cap: 'round'};
  var lock0 = dojo.byId ('lock0').checked;
  //for (var x = 0; x <= nx; x++) {
  function draw_cp (x) {
    if (version != this_version) return;
    for (var y = 0; y <= ny; y++) {
      var count = 0;
      if (edge_top[x][y]) count++;
      if (edge_left[x][y]) count++;
      if (x > 0 && edge_top[x-1][y]) count++;
      if (y > 0 && edge_left[x][y-1]) count++;
      var g = cpg.createGroup ();
      g.setTransform ([
        dojox.gfx.matrix.translate (gadget * x, gadget * y)
      ]);
      if (count == 2) {
        if ((x > 0 && edge_top[x][y] == edge_top[x-1][y]) ||
            (y > 0 && edge_left[x][y] == edge_left[x][y-1])) {
          // Straight
          if (!edge_top[x][y])
            g.applyTransform (dojox.gfx.matrix.rotateg (90));
          for (var s = -1; s <= 1; s += 2) {
            g.createLine ({x1: s*2, x2: s*2, y1: -hg, y2: hg}).setStroke (mountain180);
            g.createLine ({x1: s*1, x2: s*1, y1: -hg, y2: hg}).setStroke (valley180);
            g.createLine ({x1: -hg, x2: -2, y1: s*2, y2: s*2}).setStroke (valley90);
            g.createLine ({x1: -2, x2: -1, y1: s*2, y2: s*2}).setStroke (mountain90);
            g.createLine ({x1: -1, x2: 1, y1: s*2, y2: s*2}).setStroke (valley90);
            g.createLine ({x1: 1, x2: 2, y1: s*2, y2: s*2}).setStroke (mountain90);
            g.createLine ({x1: 2, x2: hg, y1: s*2, y2: s*2}).setStroke (valley90);
          }
          g.createLine ({x1: -hg, x2: -2, y1: 0, y2: 0}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -1, y1: 0, y2: 0}).setStroke (valley180);
          g.createLine ({x1: -1, x2: 1, y1: 0, y2: 0}).setStroke (mountain180);
          g.createLine ({x1: 1, x2: 2, y1: 0, y2: 0}).setStroke (valley180);
          g.createLine ({x1: 2, x2: hg, y1: 0, y2: 0}).setStroke (mountain180);
        } else {
          // Corner
          if (edge_top[x][y] && edge_left[x][y])
            g.applyTransform (dojox.gfx.matrix.rotateg (-90));
          else if (edge_top[x][y] && (y > 0 && edge_left[x][y-1]))
            g.applyTransform (dojox.gfx.matrix.rotateg (180));
          else if ((x > 0 && edge_top[x-1][y]) && (y > 0 && edge_left[x][y-1]))
            g.applyTransform (dojox.gfx.matrix.rotateg (90));
          g.createLine ({x1: -2, x2: -2, y1: -hg, y2: 2}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -2, y1:  2, y2: hg}).setStroke (valley90);
          g.createLine ({x1: -1, x2: -1, y1: -hg, y2: -1}).setStroke (valley180);
          g.createLine ({x1: -1, x2:  0, y1: -1, y2: -1}).setStroke (valley180);
          g.createLine ({x1:  0, x2:  1, y1: -1, y2: -2}).setStroke (valley180);
          g.createLine ({x1:  0, x2:  1, y1: -1, y2:  0}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  2, y1: -2, y2: -1}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  2, y1:  0, y2: -1}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  1, y1: -hg, y2: -2}).setStroke (valley180);
          g.createLine ({x1:  2, x2: hg, y1: -1, y2: -1}).setStroke (valley180);
          g.createLine ({x1:  1, x2: 3, y1: -3, y2: -1}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  1, y1:  0, y2:  1}).setStroke (valley180);
          g.createLine ({x1:  1, x2: hg, y1:  1, y2:  1}).setStroke (valley180);
          g.createLine ({x1:  2, x2:  2, y1: -hg, y2: -1}).setStroke (mountain180);
          g.createLine ({x1:  1, x2: hg, y1: -2, y2: -2}).setStroke (mountain180);
          g.createLine ({x1: -hg, x2: -2, y1: -2, y2: -2}).setStroke (valley90);
          g.createLine ({x1: -2, x2: -1, y1: -2, y2: -2}).setStroke (mountain90);
          g.createLine ({x1: -1, x2:  0, y1: -2, y2: -2}).setStroke (valley90);
          g.createLine ({x1:  0, x2:  0, y1: -2, y2:  2}).setStroke (mountain90);
          g.createLine ({x1:  0, x2:  0, y1:  2, y2: hg}).setStroke (mountain180);
          g.createLine ({x1: -hg, x2:  0, y1:  0, y2:  0}).setStroke (mountain180);
          g.createLine ({x1:  0, x2:  2, y1:  0, y2:  0}).setStroke (mountain90);
          g.createLine ({x1:  2, x2:  2, y1:  0, y2:  1}).setStroke (valley90);
          g.createLine ({x1:  2, x2:  2, y1:  1, y2:  2}).setStroke (mountain90);
          g.createLine ({x1:  2, x2:  2, y1:  2, y2: hg}).setStroke (valley90);
          g.createLine ({x1: -hg, x2:  0, y1:  2, y2:  2}).setStroke (valley90);
          g.createLine ({x1:  0, x2: hg, y1:  2, y2:  2}).setStroke (mountain180);
          g.createLine ({x1: -2, x2:  0, y1:  2, y2:  0}).setStroke (valley180);
          g.createLine ({x1: -2, x2: -1, y1:  0, y2:  1}).setStroke (valley180);
          g.createLine ({x1: -1, x2:  0, y1:  1, y2:  2}).setStroke (mountain180);
          g.createLine ({x1:  0, x2:  1, y1:  2, y2:  1}).setStroke (valley180);
          g.createLine ({x1:  1, x2: 3, y1:  1, y2: -1}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -1, y1:  0, y2: -1}).setStroke (valley180);
          g.createLine ({x1: -1, x2:  1, y1: -1, y2: -3}).setStroke (mountain180);
        }
      } else if (count == 1) {
        if (edge_left[x][y])
          g.applyTransform (dojox.gfx.matrix.rotateg (90));
        else if (x > 0 && edge_top[x-1][y])
          g.applyTransform (dojox.gfx.matrix.rotateg (180));
        else if (y > 0 && edge_left[x][y-1])
          g.applyTransform (dojox.gfx.matrix.rotateg (-90));
        for (var s = -1; s <= 1; s += 2) {
          g.createLine ({x1: -hg, x2: -2, y1: s*2, y2: s*2}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -2, y1: s*hg, y2: s*2}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -1, y1: s*2, y2: s*3}).setStroke (valley180);
          g.createLine ({x1: -2, x2:  0, y1: s*2, y2:   0}).setStroke (mountain180);
          g.createLine ({x1:  0, x2:  0, y1: s*2, y2: s*1}).setStroke (mountain90);
          g.createLine ({x1:  0, x2:  1, y1: s*2, y2: s*2}).setStroke (valley90);
          g.createLine ({x1:  1, x2:  2, y1: s*2, y2: s*2}).setStroke (mountain90);
          g.createLine ({x1:  2, x2: hg, y1: s*2, y2: s*2}).setStroke (valley90);
          g.createLine ({x1: -1, x2:  1, y1: s*3, y2: s*1}).setStroke (mountain180);
          g.createLine ({x1:  1, x2:  2, y1: s*1, y2:   0}).setStroke (valley180);
          g.createLine ({x1: -hg, x2:  1, y1: s*1, y2: s*1}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  1, y1: s*hg, y2: s*1}).setStroke (valley180);
        }
        g.createLine ({x1: -1, x2: -1, y1: -hg, y2: hg}).setStroke (valley180);
        g.createLine ({x1:  0, x2:  0, y1: -1, y2:  1}).setStroke (valley90);
        g.createLine ({x1:  2, x2:  2, y1: -hg, y2: hg}).setStroke (mountain180);
        g.createLine ({x1:  0, x2: hg, y1:  0, y2:  0}).setStroke (mountain180);
      } else if (count == 3) {
        if (!edge_left[x][y])
          g.applyTransform (dojox.gfx.matrix.rotateg (90));
        else if (!(x > 0 && edge_top[x-1][y]))
          g.applyTransform (dojox.gfx.matrix.rotateg (180));
        else if (!(y > 0 && edge_left[x][y-1]))
          g.applyTransform (dojox.gfx.matrix.rotateg (-90));
        for (var s = -1; s <= 1; s += 2) {
          g.createLine ({x1: -1, x2: hg, y1: s*1, y2: s*1}).setStroke (valley180);
          g.createLine ({x1: -2, x2: hg, y1: s*2, y2: s*2}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -hg, y1: s*2, y2: s*2}).setStroke (valley90);
          g.createLine ({x1: -2, x2: -2, y1: s*2, y2: s*hg}).setStroke (valley90);
          g.createLine ({x1: -2, x2: -1, y1:   0, y2: s*1}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -1, y1: s*2, y2: s*1}).setStroke (valley180);
          g.createLine ({x1: -2, x2: -1, y1: s*2, y2: s*1}).setStroke (valley180);
          g.createLine ({x1:  0, x2:  0, y1: s*1, y2: s*2}).setStroke (valley180);
          g.createLine ({x1:  0, x2:  0, y1: s*2, y2: s*hg}).setStroke (mountain180);
          g.createLine ({x1:  2, x2:  2, y1: s*1, y2: s*2}).setStroke (mountain90);
          g.createLine ({x1:  2, x2:  2, y1: s*2, y2: s*hg}).setStroke (valley90);
        }
        g.createLine ({x1: -2, x2: -2, y1: -2, y2:  2}).setStroke (valley180);
        g.createLine ({x1: -1, x2: -1, y1: -1, y2:  1}).setStroke (valley180);
        g.createLine ({x1:  0, x2:  0, y1: -1, y2:  1}).setStroke (mountain180);
        g.createLine ({x1:  2, x2:  2, y1: -1, y2:  1}).setStroke (valley90);
        g.createLine ({x1: -hg, x2: -2, y1:  0, y2:  0}).setStroke (mountain180);
      } else if (count == 4) {
        for (var s = -1; s <= 1; s += 2) {
          g.createLine ({x1: -hg, x2:  0, y1: s*2, y2: s*2}).setStroke (valley90);
          g.createLine ({x1:  0, x2:  2, y1: s*2, y2: s*2}).setStroke (mountain90);
          g.createLine ({x1:  2, x2: hg, y1: s*2, y2: s*2}).setStroke (valley90);
          g.createLine ({x1: -2, x2: -2, y1: s*hg, y2: s*2}).setStroke (valley90);
          g.createLine ({x1: -2, x2:  2, y1: s*2, y2:-s*2}).setStroke (valley180);
          g.createLine ({x1:  2, x2:  2, y1: s*hg, y2: s*2}).setStroke (valley90);
        }
        g.createLine ({x1: -2, x2: -2, y1: -2, y2:  2}).setStroke (mountain180);
        g.createLine ({x1:  0, x2:  0, y1: -hg, y2: hg}).setStroke (mountain180);
        g.createLine ({x1: -hg, x2: -2, y1:  0, y2:  0}).setStroke (mountain180);
        g.createLine ({x1: -2, x2:  0, y1:  0, y2:  0}).setStroke (valley180);
        g.createLine ({x1:  0, x2: hg, y1:  0, y2:  0}).setStroke (mountain180);
        /*
        g.createLine ({x1: -hg, x2:  3, y1: -2, y2: -2}).setStroke (stroke);
        g.createLine ({x1: -hg, x2: hg, y1:  0, y2:  0}).setStroke (stroke);
        g.createLine ({x1: -hg, x2: -2, y1:  2, y2:  2}).setStroke (stroke);
        g.createLine ({x1:  2, x2: hg, y1:  2, y2:  2}).setStroke (stroke);
        g.createLine ({x1: -2, x2: -2, y1: -hg, y2: hg}).setStroke (stroke);
        g.createLine ({x1:  0, x2:  0, y1: -hg, y2: hg}).setStroke (stroke);
        g.createLine ({x1:  2, x2:  2, y1: -hg, y2: hg}).setStroke (stroke);
        g.createLine ({x1: -2, x2:  2, y1: -2, y2:  2}).setStroke (stroke);
        g.createLine ({x1:  2, x2: -2, y1: -2, y2:  2}).setStroke (stroke);
        */
      } else if (count == 0) {
        if (lock0) {
          for (var s = -1; s <= 1; s += 2) {
            for (var t = -1; t <= 1; t += 2) {
              g.createLine ({x1: s*hg, x2: s*2, y1: t*2, y2: t*2}).setStroke (mountain180);
              g.createLine ({x1: s*hg, x2: s*1, y1: t*1, y2: t*1}).setStroke (valley180);
              g.createLine ({x1: s*1, x2: s*1, y1: t*hg, y2: t*1}).setStroke (valley180);
              g.createLine ({x1: s*3, x2: s*2, y1: t*1, y2: 0}).setStroke (mountain180);
              g.createLine ({x1: s*2, x2: s*1, y1: t*2, y2: t*1}).setStroke (mountain180);
              g.createLine ({x1: s*3, x2: s*2, y1: t*1, y2: t*2}).setStroke (valley180);
            }
            g.createLine ({x1: s*2, x2: s*2, y1: -hg, y2: -1}).setStroke (mountain180);
            g.createLine ({x1: s*2, x2: s*2, y1: -1, y2:  0}).setStroke (valley180);
            g.createLine ({x1: s*2, x2: s*2, y1:  2, y2: hg}).setStroke (mountain180);
            g.createLine ({x1: s*2, x2: s*1, y1: -2, y2: -2}).setStroke (valley180);
            g.createLine ({x1: s, x2: -s, y1: s, y2: -s}).setStroke (valley180);
            g.createLine ({x1: -s, x2: s, y1: s, y2: -s}).setStroke (valley180);
          }
          g.createLine ({x1: -1, x2: 1, y1: -2, y2: -2}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: 2, y1:  0, y2:  0}).setStroke (mountain180);
          /* // This version works (folded by hand by Marty) but is not as symmetric:
          for (var s = -1; s <= 1; s += 2) {
            for (var t = -1; t <= 1; t += 2) {
              g.createLine ({x1: s*hg, x2: s*2, y1: t*2, y2: t*2}).setStroke (mountain180);
              g.createLine ({x1: s*2, x2: s*2, y1: t*hg, y2: t*2}).setStroke (mountain180);
              g.createLine ({x1: s*hg, x2: s*2, y1: t*1, y2: t*2}).setStroke (valley180);
            }
            g.createLine ({x1: s*2, x2: s*1, y1: -2, y2: -1}).setStroke (mountain180);
            g.createLine ({x1: s*1, x2: s*1, y1: -hg, y2: -1}).setStroke (valley180);
            g.createLine ({x1: s*hg, x2: s*1, y1: -1, y2: -1}).setStroke (valley180);
            g.createLine ({x1: s*hg, x2: s*2, y1: -1, y2: 0}).setStroke (mountain180);
          }
          g.createLine ({x1: -2, x2: -1, y1: 2, y2: 1}).setStroke (mountain180);
          g.createLine ({x1:  2, x2: -1, y1: 2, y2: -1}).setStroke (valley180);
          g.createLine ({x1: -1, x2:  1, y1: 1, y2: -1}).setStroke (valley180);
          g.createLine ({x1: -1, x2: -1, y1: hg, y2: 1}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  1, y1: hg, y2: 2}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  1, y1: 2, y2: 1}).setStroke (mountain180);
          g.createLine ({x1: -hg, x2: -1, y1: 1, y2: 1}).setStroke (valley180);
          g.createLine ({x1:  1, x2:  2, y1: 1, y2: 1}).setStroke (valley180);
          g.createLine ({x1:  2, x2: hg, y1: 1, y2: 1}).setStroke (mountain180);
          g.createLine ({x1: -hg, x2: -2, y1: 1, y2: 0}).setStroke (mountain180);
          g.createLine ({x1: hg, x2:  2, y1: 1, y2: 0}).setStroke (valley180);

          g.createLine ({x1: -2, x2: -2, y1: hg, y2: 1}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -2, y1: 1, y2: 0}).setStroke (valley180);
          g.createLine ({x1:  2, x2:  2, y1: hg, y2: 0}).setStroke (mountain180);
          g.createLine ({x1: -2, x2: -1, y1: 2, y2: 2}).setStroke (valley180);
          g.createLine ({x1: -1, x2: hg, y1: 2, y2: 2}).setStroke (mountain180);

          g.createLine ({x1: -2, x2:  2, y1: 0, y2: 0}).setStroke (mountain180);
          */
        } else {
          for (var s = -1; s <= 1; s += 2) {
            for (var t = -1; t <= 1; t += 2) {
              g.createLine ({x1: s*hg, x2: s*2, y1: 2*t, y2: 2*t}).setStroke (mountain180);
              g.createLine ({x1: s*2, x2: s*1, y1: 2*t, y2: 2*t}).setStroke (valley180);
              g.createLine ({x1: s*hg, x2: s*2, y1: 1*t, y2: 1*t}).setStroke (valley180);
              g.createLine ({x1: s*2, x2: s*1, y1: 1*t, y2: 1*t}).setStroke (mountain180);
            }
            g.createLine ({x1: -1, x2: 1, y1: 2*s, y2: 2*s}).setStroke (mountain180);
            g.createLine ({x1: -1, x2: 1, y1: 1*s, y2: 1*s}).setStroke (valley180);
            g.createLine ({x1: s*2, x2: s*2, y1: -hg, y2: hg}).setStroke (mountain180);
            g.createLine ({x1: s*1, x2: s*1, y1: -hg, y2: hg}).setStroke (valley180);
          }
        }
      }
    }
    if (x < nx)
      setTimeout (function () { draw_cp (x+1) }, 0);
  }
  //if (!d3on)
  setTimeout (function () { draw_cp (0) }, 0);
}

function change_nx (delta, shift) {
  nx += delta;
  if (nx < 1) nx = 1;
  update_nx_ny (false, shift ? delta : 0, 0);
  return true;
}

function change_ny (delta, shift) {
  ny += delta;
  if (ny < 1) ny = 1;
  update_nx_ny (false, 0, shift ? delta : 0);
  return true;
}

function clear_maze (no_update) {
  for (var x = 0; x <= nx; x++) {
    for (var y = 0; y <= ny; y++) {
      edge_top[x][y] = NOTHING;
      edge_left[x][y] = NOTHING;
    }
  }
  if (!no_update) {
    maze_is_text = false;
    update_maze ();
  }
}

function random_maze () {
  // Grow a maze via randomized DFS:
  var parent = {};
  var frontier = [[null, [0,0]]];
  while (frontier.length > 0) {
    // Extract random edge (parent, child)
    var i = Math.floor (Math.random () * frontier.length);
    var p = frontier[i][0];
    var c = frontier[i][1];
    if (frontier.length == 1)
      frontier.pop ();
    else
      frontier[i] = frontier.pop ();
    if (parent[c] == undefined) {
      parent[c] = p;
      if (c[0] > 0)
        frontier.push ([c, [c[0]-1, c[1]]]);
      if (c[1] > 0)
        frontier.push ([c, [c[0], c[1]-1]]);
      if (c[0] < nx-1)
        frontier.push ([c, [c[0]+1, c[1]]]);
      if (c[1] < ny-1)
        frontier.push ([c, [c[0], c[1]+1]]);
    }
  }

  // Convert to edge representation.
  for (var y = 0; y < ny; y++) {
    edge_left[0][y] = WALL;
    for (var x = 1; x < nx; x++) {
      edge_left[x][y] =
        (parent[[x,y]][0] == x-1 && parent[[x,y]][1] == y) ||
        (parent[[x-1,y]][0] == x && parent[[x-1,y]][1] == y) ? NOTHING : WALL;
    }
    edge_left[nx][y] = WALL;
  }
  for (var x = 0; x < nx; x++) {
    edge_top[x][0] = WALL;
    for (var y = 1; y < ny; y++) {
      edge_top[x][y] =
        (parent[[x,y]][0] == x && parent[[x,y]][1] == y-1) ||
        (parent[[x,y-1]][0] == x && parent[[x,y-1]][1] == y) ? NOTHING : WALL;
    }
    edge_top[x][ny] = WALL;
  }

  maze_is_text = false;
  update_maze ();

  return true;
}

var HLINE = '-', NOHLINE = 'x', VLINE = '|', NOVLINE = 'x', LINESEP = '!';

function flatten_maze () {
  var lines = [];
  for (var y = 0; y <= ny; y++) {
    var horiz = '';
    for (var x = 0; x < nx; x++) {
      horiz += (edge_top[x][y] ? HLINE : NOHLINE);
    }
    lines.push (horiz);
    if (y < ny) {
      var vert = '';
      for (var x = 0; x <= nx; x++) {
        vert += (edge_left[x][y] ? VLINE : NOVLINE);
      }
      lines.push (vert);
    }
  }
  return lines.join (LINESEP);
}

function deflatten_maze (flat) {
  var lines = flat.split (LINESEP);
  nx = lines[0].length;
  ny = (lines.length - 1) / 2;
  update_nx_ny (true);
  var line = 0;
  for (var y = 0; y <= ny; y++) {
    for (var x = 0; x < nx; x++) {
      edge_top[x][y] = (lines[line][x] == HLINE ? WALL : NOTHING);
    }
    line++;
    if (y < ny) {
      for (var x = 0; x <= nx; x++) {
        edge_left[x][y] = (lines[line][x] == VLINE ? WALL : NOTHING);
      }
      line++;
    }
  }
  maze_is_text = false;
  update_maze ();
}

function link_to_self () {
  var q = {};
  if (maze_is_text) {
    q.text = dojo.byId ('text').value;
  } else {
    q.maze = flatten_maze ();
  }
  if (dojo.byId ('lock0').checked)
    q.lock0 = 1;
  if (dojo.byId ('front').checked)
    q.front = 1;
  if (channel != 1)
    q.channel = channel;
  dojo.byId ('textlink').innerHTML = '[<A HREF="?' +
    dojo.objectToQuery (q) + '">link to this view</A>]';
}

var font = {
  ' ': [[0],[0],[]],
  'A': [[1,1],[1,1],[1,1,0]],
  //'a': [[0,1],[1,1],[1,1,1]],
  'B': [[1,1,0],[1,0,1],[1,0,1,1,1,1]],
  //'b': [[1,0],[1,1],[0,1,1]],
  'C': [[1,0],[1,0],[1,0,1]],
  //'c': [[0,0],[1,0],[0,1,1]],
  'd': [[0,1],[1,1],[0,1,1]],
  'E': [[1,0],[1,0],[1,1,1]],
  //'e': [[1,1],[1,0],[1,1,1]],
  'F': [[1,0],[1,0],[1,1,0]],
  'G': [[1,0],[1,1],[1,0,1]],
  //'g': [[1,1],[0,1],[1,1,1]],
  'H': [[1,1],[1,1],[0,1,0]],
  //'h': [[1,0],[1,1],[0,1,0]],
  'I': [[0,1,0],[0,1,0],[1,1,0,0,1,1]],
  //'i': [[1],[1],[]],
  'J': [[0,1],[1,1],[0,0,1]],
  'K': [[1,0,1],[1,1,0],[0,0,1,1,0,1]],
  'L': [[1,0],[1,0],[0,0,1]],
  'M': [[1,1,1],[1,0,1],[1,1,0,0,0,0]],
  //'m': [[0,0,0],[1,1,1],[0,0,1,1,0,0]],
  'N': [[1,1,1],[1,1,1],[1,0,0,0,0,1]],
  //'n': [[0,0,0],[1,1,1],[0,0,1,0,0,1]],
  'O': [[1,1],[1,1],[1,0,1]],
  //'o': [[0,0],[1,1],[0,1,1]],
  'P': [[1,1],[1,0],[1,1,0]],
  'Q': [[1,1,0],[1,1,0],[1,0,0,0,1,1]],
  //'q': [[1,1],[0,1],[1,1,0]],
  'R': [[1,0,1],[1,1,0],[1,1,1,1,0,1]],
  'S': [[1,0],[0,1],[1,1,1]],
  'T': [[0,1,0],[0,1,0],[1,1,0,0,0,0]],
  //'t': [[0,1,0],[0,1,0],[0,0,1,1,0,1]],
  'U': [[1,1],[1,1],[0,0,1]],
  //'u': [[0,0],[1,1],[0,0,1]],
  'V': [[1,0,0,1],[0,1,1,0],[0,0,0,1,0,1,0,1,0]],
  'W': [[1,0,1],[1,1,1],[0,0,0,0,1,1]],
  //'w': [[0,0,0],[1,1,1],[0,0,0,0,1,1]],
  'X': [[0,1,1,0],[0,1,1,0],[1,0,1,0,1,0,1,0,1]],
  'Y': [[1,1],[0,1],[0,1,1]],
  'Z': [[0,0,1],[1,0,0],[1,1,1,1,1,1]],
  '1': [[1],[1],[]],
  '2': [[0,1],[1,0],[1,1,1]],
  '3': [[0,1],[0,1],[1,1,1]],
  '4': [[1,1],[0,1],[0,1,0]],
  '5': [[1,0],[0,1],[1,1,1]],
  '6': [[1,0],[1,1],[1,1,1]],
  '7': [[0,1],[0,1],[1,0,0]],
  '8': [[1,1],[1,1],[1,1,1]],
  '9': [[1,1],[0,1],[1,1,0]],
  '0': [[1,1],[1,1],[1,0,1]],
  '-': [[0,0],[0,0],[0,1,0]],
  '+': [[0,1,0],[0,1,0],[0,0,1,1,0,0]],
  '=': [[0,0],[0,0],[0,1,1]],
  "'": [[1],[0],[]],
  '"': [[1,1],[0,0],[0,0,0]],
  '?': [[1,0,1],[0,1,0],[1,1,0,1,0,0]],
  '.': [[0,0],[0,0],[0,0,1]],
  ',': [[0,0],[0,0],[0,0,1]],
  '_': [[0,0],[0,0],[0,0,1]]
};

function font_lookup (x) {
  if (x in font) {
    return font[x];
  } else if (x.toLowerCase () in font) {
    return font[x.toLowerCase ()];
  } else if (x.toUpperCase () in font) {
    return font[x.toUpperCase ()];
  } else {
    return [[],[],[]];
  }
}

var oldText;

function text_to_maze () {
  var text = dojo.byId ('text').value;
  if (text == oldText) return;
  oldText = text;

  text = text.split ('\n');
  text = dojo.map (text, function (line) {
    return dojo.map (line, font_lookup);
  });

  ny = 3*text.length-1;
  nx = Math.max.apply (null, dojo.map (text, function (line) {
    var len = -1;
    dojo.forEach (line, function (char) {
      len += char[0].length;
    });
    return len;
  }));
  update_nx_ny (true);
  clear_maze (true);

  dojo.forEach (text, function (line, y) {
    y *= 3;
    var x = 0;
    dojo.forEach (line, function (char) {
      for (var dx = 0; dx < char[0].length; dx++) {
        edge_left[x+dx][y] = char[0][dx];
        edge_left[x+dx][y+1] = char[1][dx];
      }
      for (var dx = 0; dx < char[0].length-1; dx++) {
        edge_top[x+dx][y] = char[2][dx];
        edge_top[x+dx][y+1] = char[2][char[0].length-1+dx];
        edge_top[x+dx][y+2] = char[2][2*(char[0].length-1)+dx];
      }
      x += char[0].length;
    });
  });

  maze_is_text = true;
  update_maze ();
}

function toggle_edge (event) {
  var pos = dojo.position (dojo.byId ('maze'), true);
  var x = event.pageX - pos.x, y = event.pageY - pos.y;
  x = (x - xoff) / scale;
  y = (y - yoff) / scale;
  if (Math.abs (x - Math.round (x)) < Math.abs (y - Math.round (y))) {
    x = Math.round (x);
    y = Math.floor (y);
    if (x >= 0 && x <= nx && y >= 0 && y < ny) {
      edge_left[x][y] = 1 - edge_left[x][y];
      maze_is_text = false;
      update_maze ();
    }
  } else {
    x = Math.floor (x);
    y = Math.round (y);
    if (x >= 0 && x < nx && y >= 0 && y <= ny) {
      edge_top[x][y] = 1 - edge_top[x][y];
      maze_is_text = false;
      update_maze ();
    }
  }

  return true;
}

var d3x1, d3y1, d3xang1, d3yang1, d3conn = null;

function d3down (event) {
  d3x1 = event.screenX;
  d3y1 = event.screenY;
  d3xang1 = d3xang;
  d3yang1 = d3yang;
  if (d3conn == null) {
    d3conn = [
      dojo.connect (window, 'onmousemove', d3move),
      dojo.connect (window, 'onmouseup', d3up)
    ];
  }
}

function d3move (event) {
  var dx = event.screenX - d3x1, dy = event.screenY - d3y1;
  d3xang = d3xang1 + dy;
  d3yang = d3yang1 + dx;
  d3view ();
}

function d3out (event) {
  if (d3conn != null) {
    dojo.disconnect (d3conn[0]);
    dojo.disconnect (d3conn[1]);
    d3conn = null;
  }
}

function d3up (event) {
  d3move (event);
  d3out (event);
}

var am_out;

function maybe_out (event) {
  //if (event.target != surface.getEventSource ()) return;
  am_out = true;
  //maybe_outs.push (out);
  setTimeout (function () {
    if (am_out)
      d3out ();
  }, 100);
}

function not_out (event) {
  am_out = false;
}

function d3reset () {
  d3xang = -45;
  d3yang = 45;
  d3view ();
}

function d3change (dx, dy) {
  d3xang += dy;
  d3yang += dx;
  d3view ();
}

function set_channel (newchannel, fromtext) {
  if (typeof newchannel == 'string')
    newchannel = parseFloat (newchannel);
  if (isNaN (newchannel) || newchannel < 1)
    return;
  if (oldchannel == newchannel)
    return;
  channel = oldchannel = newchannel;
  if (!fromtext)
    dojo.byId ('channel').value = channel;
  update_cpscale ();
  update_maze ();
}

function add_to_channel (delta) {
  set_channel (channel + delta);
}

function check_channel () {
  set_channel (dojo.byId ('channel').value, true);
}

function front_or_d3 () {
  if (dojo.byId ('front').checked) {
    dojo.byId ('front3').style.display = 'block';
    dojo.byId ('d3').style.display = 'none';
  } else {
    dojo.byId ('front3').style.display = 'none';
    dojo.byId ('d3').style.display = 'block';
  }
  link_to_self ();
}
