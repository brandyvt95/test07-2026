import { Box3, BoxHelper, Vector3, Group } from 'three';

export class ModelProcessor {
    constructor(scene) {
        this.scene = scene;
        this.helpers = new Group();
        this.scene.add(this.helpers);
    }

    visualizeBoundingBoxes(object) {
        object.traverse(child => {
            if (child.isMesh) {
                const helper = new BoxHelper(child, 0xffff00);
                this.helpers.add(helper);
            }
        });
    }

    clearHelpers() {
        while (this.helpers.children.length > 0) {
            const helper = this.helpers.children[0];
            helper.geometry.dispose();
            helper.material.dispose();
            this.helpers.remove(helper);
        }
    }

    arrangeMeshesInRow(object) {
        const meshes = [];
        object.traverse(child => {
            if (child.isMesh) {
                meshes.push(child);
            }
        });

        let currentX = 0;
        const spacing = 0.1; // Khoảng cách nhỏ giữa các mesh

        meshes.forEach((mesh, index) => {
            // Tính toán bounding box thực tế của mesh này
            const box = new Box3().setFromObject(mesh);
            const size = new Vector3();
            box.getSize(size);

            // Đưa mesh về tâm của chính nó trước khi dịch chuyển (tùy chọn, 
            // nhưng ở đây ta dịch chuyển dựa trên world position hiện tại)
            // Để đơn giản, ta tính offset để box.min.x của mesh nằm tại currentX
            const offset = currentX - box.min.x;
            mesh.position.x += offset;

            // Cập nhật currentX cho mesh tiếp theo
            currentX += size.x + spacing;
        });
    }

    process(object, options = {}) {
        this.clearHelpers();

        if (options.arrangeInRow) {
            this.arrangeMeshesInRow(object);
        }

        if (options.showBoxes) {
            this.visualizeBoundingBoxes(object);
        }
    }
}
