
---- 
**Table of Contents**
- [Motivations and Goals](#motivations-and-goals)
- [Set-up Instructions](#set-up-instructions)
    - [1. Installing Dependencies](#1-installing-dependencies)
    - [2. Running the Files](#2-running-the-files)
- [OrigamiSimulator WriteUp from original repo](#origamisimulator-writeup-from-original-repo)
----
# Motivations and Goals

This repo aims to value-add to Amanda Ghassaei's Origami Simulator and Eric Demaine's Maze Folder by putting it in a single pipeline.


# Set-up Instructions

This section describes how to get Amanda Ghassaei's Origami Simulator as well as Eric Demaine's Maze Folder running locally *after* cloning this repository into your local machine. Instructions are OS-agnostic.

### 1. Installing Dependencies

We have already extracted the code for MazeFolder and it's in [the ./mazeFiles subdir](./mazeFiles/). 
The scripts within `maze.js` rely on the Dojo Framework, specifically the gfx module to handle the graphics aspects. 

Download the Dojo Toolkit's [release package](https://dojotoolkit.org/download/). If running on a Unix env, select the tar gz file. 
The Download location should be in the same Projects directory as the dir you're cloning this repository in: 

    
    ├── project
    │   ├── dojo-release-1.16.3
    │   ├── OrigamiTest
    │   └── OrigamiTest2

The reason for this is that relative urls are used in [maze.js](mazeFiles/maze.js), and it will come in handy if truly working offline (untested for now).


### 2. Running the Files

Amanda is [here](./index.html), pls open it up in your browser of choice. 
* pls note that the file paths are not correct hence it's not possible to load svg's simply by clicking the dropdown tabs in Amanda, **instead**, pls use the import feature and select the svg files as in the [./assets folder](./assets/). Specifically, the font related assets are in [./assets/Squaremaze](./assets/Squaremaze/). We won't be fixing this anytime soon because it's trivial. #todo 

MazeFolder's html file is [here](./mazeFiles/fakeIndex.html).





# OrigamiSimulator WriteUp from [original repo](https://github.com/amandaghassaei/OrigamiSimulator)

Live demo at <a href="https://origamisimulator.org/">origamisimulator.org</a><br/>

<img src="assets/doc/crane.gif" />

This app allows you to simulate how any origami crease pattern will fold.  It may look a little different
from what you typically think of as "origami" - rather than folding paper in a set of sequential steps,
this simulation attempts to fold every crease simultaneously. It does this by iteratively solving for small displacements in the geometry of an initially flat sheet due to forces
exerted by creases.
You can read more about it in our paper:
<ul>
<li><a target="_blank" href="http://erikdemaine.org/papers/OrigamiSimulator_Origami7/">Fast, Interactive Origami Simulation using GPU Computation</a> by Amanda Ghassaei, Erik Demaine, and Neil Gershenfeld (7OSME)
</ul>

All simulation methods were written from scratch and are executed in parallel in several GPU fragment shaders for fast performance.
The solver extends work from the following sources:
<ul>
<li><a target="_blank" href="http://www2.eng.cam.ac.uk/~sdg/preprint/5OSME.pdf">Origami Folding: A Structural Engineering Approach</a> by Mark Schenk and Simon D. Guest<br/>
<li><a target="_blank" href="http://www.tsg.ne.jp/TT/cg/TachiFreeformOrigami2010.pdf">Freeform Variations of Origami</a> by Tomohiro Tachi<br/>
</ul>

<p>
<b>Instructions:</b><br/><br/>
<img style="width: 100%; max-width:600px" src="assets/doc/demoui.gif" /><br/>
<ul>
    <li>Slide the <b>Fold Percent</b> slider to control the degree of folding of the pattern (100% is fully folded, 0% is unfolded,
        and -100% is fully folded with the opposite mountain/valley assignments).</li>
    <li>Drag to rotate the model, text_to to zoom.</li>
    <li>Import other patterns under the <b>Examples</b> menu.</li>
    <li>Upload your own crease patterns in SVG or <a href="https://github.com/edemaine/fold" target="_blank">FOLD</a> formats, following the instructions under <b>File > File Import Tips</b>.</li>
    <li>Export FOLD files or 3D models ( STL or OBJ ) of the folded state of your design ( <b>File > Save Simulation as...</b> ).</li>
    </ul>
        <img style="width: 100%;" src="assets/doc/strain.jpg" />
    <ul>
    <li>Visualize the internal strain of the origami as it folds using the <b>Strain Visualization</b> in the left menu.</li>
    </ul>
        <img src="assets/doc/huffmanvr.jpg" /><br/>
    <ul>
    <li>If you are working from a computer connected to a Vive, follow the instructions near the <b>VR</b> menu
        to use this app in an interactive virtual reality mode.</li>
</ul>

<br/>

<b>External Libraries:</b><br/><br/>
<ul>
    <li>All rendering and 3D interaction done with <a target="_blank" href="https://threejs.org/">three.js</a></li>
    <li><a href="https://www.npmjs.com/package/path-data-polyfill" target="_blank">path-data-polyfill</a> helps with SVG path parsing</li>
    <li><a href="https://github.com/edemaine/fold" target="_blank">FOLD</a> is used as the internal data structure, methods from the
        <a href="https://github.com/edemaine/fold/blob/master/doc/api.md" target="_blank">FOLD API</a> used for SVG parsing</li>
    <li>Arbitrary polygonal faces of imported geometry are triangulated using the <a target="_blank" href="https://github.com/mapbox/earcut">Earcut Library</a></li>
    <li>GIF and WebM video export uses <a target="_blank" href="https://github.com/spite/ccapture.js/">CCapture</a></li>
    <li>Portability to multiple VR controllers by <a target="_blank" href="https://github.com/stewdio/THREE.VRController">THREE.VRController.js</a></li>
    <li>VR GUI by <a href="https://github.com/dataarts/dat.guiVR" target="_blank">dat.guiVR</a></li>
    <li><a href="http://www.numericjs.com/" target="_blank">numeric.js</a> for linear algebra operations</li>
    <li><a href="https://github.com/eligrey/FileSaver.js/" target="_blank">FileSaver</a> for client-side file saving</li>
    <li><a target="_blank" href="https://jquery.com/">jQuery</a>, <a target="_blank" href="http://getbootstrap.com/">Bootstrap</a>, and the
        <a target="_blank" href="http://designmodo.github.io/Flat-UI/">Flat UI theme</a> used to build the GUI</li>
</ul>
<p>
<br/>
Built by <a href="http://www.amandaghassaei.com/" target="_blank">Amanda Ghassaei</a> as a final project for <a href="http://courses.csail.mit.edu/6.849/spring17/" target="_blank">Geometric Folding Algorithms</a>.
Code available on <a href="https://github.com/amandaghassaei/OrigamiSimulator" target="_blank">Github</a>.  If you have interesting crease patterns that would
make good demo files, please send them to me (Amanda) so I can add them to the <b>Examples</b> menu.  My email address is on my website.  Thanks!<br/>
<br/>
You can find additional information in <a href="http://erikdemaine.org/papers/OrigamiSimulator_Origami7/" target="_blank">our 7OSME paper</a> and <a href="http://www.amandaghassaei.com/projects/origami_simulator/" target="_blank">this website</a>.<br/>
