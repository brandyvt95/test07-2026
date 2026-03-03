export class SceneGraph {
    constructor(scene, gui) {
        this.scene = scene;
        this.gui = gui;
        this.folder = gui.addFolder('Scene Graph');
        this.nodes = new Map();
        this.update();
    }

    update() {
        // Clean up previous folder entries
        const children = [...this.folder.children];
        children.forEach(child => child.destroy());

        this.traverse(this.scene, this.folder);
    }

    traverse(object, parentFolder) {
        const name = object.name || object.type + ' (' + object.uuid.slice(0, 4) + ')';
        const folder = parentFolder.addFolder(name);

        folder.add(object, 'visible').name('Visible');

        if (object.position) {
            const posFolder = folder.addFolder('Position');
            posFolder.add(object.position, 'x').step(0.01);
            posFolder.add(object.position, 'y').step(0.01);
            posFolder.add(object.position, 'z').step(0.01);
            posFolder.close();
        }

        if (object.children && object.children.length > 0) {
            object.children.forEach(child => this.traverse(child, folder));
        }

        folder.close();
    }
}
