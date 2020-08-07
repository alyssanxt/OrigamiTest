/**
 * Created by amandaghassaei on 5/6/17.
 */


function initImporter(globals){

    var reader = new FileReader();

    function importDemoFile(url){
        var extension = url.split(".");
        var name = extension[extension.length-2].split("/");
        name = name[name.length-1];
        extension = extension[extension.length-1];
        // globals.setCreasePercent(0);
        if (extension == "svg"){
            globals.url = url;
            globals.filename = name;
            globals.extension = extension;
            globals.pattern.loadSVG("assets/" + url);
        } else {
            console.warn("unknown extension: " + extension);
        }
    }

    $("#fileSelector").change(function(e) {
        var files = e.target.files; // FileList object
        if (files.length < 1) {
            return;
        }

        var file = files[0];
        var extension = file.name.split(".");
        var name = extension[0];
        extension = extension[extension.length - 1];

        $(e.target).val("");

        if (extension == "svg") { // #AR: if import extension is svg, extract params from blob, loadSVG from reader and read blob as a url
            //#AR: reader.result: the "place" where imported file is "kept" in if loading is done successfully
            reader.onload = function () {
                return function (e) {
                    if (!reader.result) { 
                        warnUnableToLoad();
                        return;
                    }
                    $("#vertTol").val(globals.vertTol);
                    $("#importSettingsModal").modal("show");
                    $('#doSVGImport').click(function (e) {
                        e.preventDefault();
                        $('#doSVGImport').unbind("click");
                        globals.filename = name;
                        globals.extension = extension;
                        globals.url = null; // #AR: doesn't have a url because it's a fresh import
                        globals.pattern.loadSVG(reader.result);
                    });
                }
            }(file);
            reader.readAsDataURL(file);
        } else if (extension == "fold"){
            reader.onload = function () {
                return function (e) {
                    if (!reader.result) {
                        warnUnableToLoad();
                        return;
                    }
                    globals.filename = name;
                    globals.extension = extension;
                    globals.url = null;

                    try {
                        var fold = JSON.parse(reader.result);
                        // #AR: following is a warning condition, with all the error situations
                        if (!fold || !fold.vertices_coords || !fold.edges_assignment || !fold.edges_vertices || !fold.faces_vertices){
                            globals.warn("Invalid FOLD file, must contain all of: <br/>" +
                                "<br/>vertices_coords<br/>edges_vertices<br/>edges_assignment<br/>faces_vertices");
                            return;
                        }

                        // spec 1.0 backwards compatibility
                        //#AR: to handle the older versions of FOLD
                        if (fold.edges_foldAngles){
                            fold.edges_foldAngle = fold.edges_foldAngles;
                            delete fold.edges_foldAngles;
                        }
                        if (fold.edges_foldAngle){
                            globals.pattern.setFoldData(fold);
                            return;
                        }
                        $("#importFoldModal").modal("show");
                        $('#importFoldModal').on('hidden.bs.modal', function () {
                            $('#importFoldModal').off('hidden.bs.modal');
                            if (globals.foldUseAngles) {//todo this should all go to pattern.js
                                globals.setCreasePercent(1);
                                var foldAngles = []; // #AR: this arr holds the foldangles for each edge by looking at how the edges are labelled in the json key of "edge_assignment"

                                // #AR: ========= HANDLE EDGES THAT ARE LABELLED AS FLAT FIRST =================


                                for (var i=0;i<fold.edges_assignment.length;i++){
                                    var assignment = fold.edges_assignment[i];
                                    if (assignment == "F") foldAngles.push(0); // #AR: if it's "Flat" then push 0 for foldAngles 
                                    else foldAngles.push(null); 
                                }
                                fold.edges_foldAngle = foldAngles; // #AR:store the damn array as a separate param called edges_foldAngle


                                // #AR: ========= HANDLE EDGES THAT ARE M , V or F =================

                                var allCreaseParams = globals.pattern.setFoldData(fold, true);
                                var j = 0;
                                var faces = globals.pattern.getTriangulatedFaces();
                                for (var i=0;i<fold.edges_assignment.length;i++){
                                    var assignment = fold.edges_assignment[i];
                                    if (assignment !== "M" && assignment !== "V" && assignment !== "F") continue;
                                    var creaseParams = allCreaseParams[j]; // #AR: an array of crease params are held in allCreaseParams
                                    var face1 = faces[creaseParams[0]];
                                    var vec1 = makeVector(fold.vertices_coords[face1[1]]).sub(makeVector(fold.vertices_coords[face1[0]]));
                                    var vec2 = makeVector(fold.vertices_coords[face1[2]]).sub(makeVector(fold.vertices_coords[face1[0]]));
                                    var normal1 = (vec2.cross(vec1)).normalize();
                                    var face2 = faces[creaseParams[2]];
                                    vec1 = makeVector(fold.vertices_coords[face2[1]]).sub(makeVector(fold.vertices_coords[face2[0]]));
                                    vec2 = makeVector(fold.vertices_coords[face2[2]]).sub(makeVector(fold.vertices_coords[face2[0]]));
                                    var normal2 = (vec2.cross(vec1)).normalize();
                                    var angle = Math.abs(normal1.angleTo(normal2));
                                    if (assignment == "M") angle *= -1; // #AR: because angle is an abs value before this, so need to put back the damn negative sign for the mountain
                                    fold.edges_foldAngle[i] = angle * 180 / Math.PI;
                                    creaseParams[5] = angle;
                                    j++;
                                }
                                globals.model.buildModel(fold, allCreaseParams); // #AR: builds the 3d object model (likely to be some behind the scenes obj) that is stored as an attribute in the globals object 
                                return;
                            }


                        // #AR: ========= HANDLE EDGES THAT ARE LABELLED AS mountains and valleys FIRST =================

                            // #AR: finally handles mountains and vally's foldAngle. each element in the foldAngles is an angle in the range of -180 to 180 degrees 
                            // #AR: this is probably a design decision... 
                            var foldAngles = [];
                            for (var i=0;i<fold.edges_assignment.length;i++){
                                var assignment = fold.edges_assignment[i];
                                if (assignment == "M") foldAngles.push(-180);
                                else if (assignment == "V") foldAngles.push(180);
                                else if (assignment == "F") foldAngles.push(0);
                                else foldAngles.push(null);
                            }
                            fold.edges_foldAngle = foldAngles;
                            globals.pattern.setFoldData(fold);
                        });
                    } catch(err) {
                        globals.warn("Unable to parse FOLD json.");
                        console.log(err);
                    }
                }
            }(file);
            reader.readAsText(file);
        } else {
            globals.warn('Unknown file extension: .' + extension);
            return null;
        }

    });

    function makeVector(v){
        if (v.length == 2) return makeVector2(v);
        return makeVector3(v);
    }
    function makeVector2(v){
        return new THREE.Vector2(v[0], v[1]);
    }
    function makeVector3(v){
        return new THREE.Vector3(v[0], v[1], v[2]);
    }

    function warnUnableToLoad(){
        globals.warn("Unable to load file.");
    }

    return {
        importDemoFile: importDemoFile
    }
}