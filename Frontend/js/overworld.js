const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

ctx.imageSmoothingEnabled = false;

let map;
let images = new Map();


// ======================================================
// CHARACTER
// ======================================================

const playerImages = {};

const playerAnimations = {
    down: "assets/Character_down_run_no-hands-Sheet6.png",
    right: "assets/Character_side_run_no-hands-Sheet6.png",
    left: "assets/Character_side-left_run_no-hands-Sheet6.png",
    up: "assets/Character_up_run_no-hands-Sheet6.png"
};


// ======================================================
// TASTEN
// ======================================================

const keys = {};


// ======================================================
// KAMERA
// ======================================================

const camera = {
    x: 0,
    y: 0
};


// ======================================================
// SPIELER
// ======================================================

const player = {
    x: 600,
    y: 400,

    // Kollisionsbox
    width: 16,
    height: 16,

    speed: 250,

    direction: "down",
    moving: false,

    animationFrame: 0,
    animationTimer: 0,

    animationSpeed: 0.10
};

    const zoom = 1.5;


// ======================================================
// TASTATUR
// ======================================================

window.addEventListener("keydown", (event) => {

    keys[event.code] = true;

    if (
        event.code === "ArrowUp" ||
        event.code === "ArrowDown" ||
        event.code === "ArrowLeft" ||
        event.code === "ArrowRight"
    ) {
        event.preventDefault();
    }
});


window.addEventListener("keyup", (event) => {

    keys[event.code] = false;
});


// ======================================================
// MAP LADEN
// ======================================================

async function loadMap() {

    const response = await fetch("maps/overworld.json");

    if (!response.ok) {
        throw new Error(
            "overworld.json konnte nicht geladen werden."
        );
    }

    map = await response.json();

    await loadTilesets();
    await loadPlayerAnimations();

    console.log("Map geladen:", map.metadata);
    console.log("Layer:", map.layers);

    requestAnimationFrame(gameLoop);
}


// ======================================================
// TILESETS LADEN
// ======================================================

async function loadTilesets() {

    for (const tileset of map.tilesets) {

        const image = new Image();

        image.src = tileset.imageData;

        await new Promise((resolve, reject) => {

            image.onload = resolve;

            image.onerror = () => {
                reject(
                    new Error(
                        "Tileset konnte nicht geladen werden: " +
                        tileset.name
                    )
                );
            };
        });

        images.set(tileset.id, image);
    }
}


// ======================================================
// CHARACTER ANIMATIONEN LADEN
// ======================================================

async function loadPlayerAnimations() {

    for (
        const [direction, path]
        of Object.entries(playerAnimations)
    ) {

        const image = new Image();

        await new Promise((resolve, reject) => {

            image.onload = () => {

                console.log(
                    "Character geladen:",
                    direction,
                    path
                );

                resolve();
            };

            image.onerror = () => {

                reject(
                    new Error(
                        "Character-Datei konnte nicht geladen werden: " +
                        path
                    )
                );
            };

            image.src = path;
        });

        playerImages[direction] = image;
    }
}


// ======================================================
// KOLLISION ERKENNEN
// ======================================================

function isCollidableTile(tile) {

    if (!tile) {
        return false;
    }

    const tileset = map.tilesets.find(
        (set) => set.id === tile.tilesetId
    );

    if (!tileset) {
        return false;
    }

    const name = tileset.name.toLowerCase();

    const collidableKeywords = [

        "car",
        "vehicle",
        "truck",
        "van",

        "house",
        "building",
        "wall",
        "fence",

        "rock",
        "container",

        "vending_machine",

        "garbage",
        "garbagebin",

        "vent",
        "hvac",

        "lantern_2",

        "new project",
        "new project(1)",
        "new project(2)",
        "new project(3)",
        "new project(4)"
    ];

    return collidableKeywords.some(
        keyword => name.includes(keyword)
    );
}


// ======================================================
// VORDERGRUND OBJEKTE
// ======================================================

function isForegroundTile(tile) {

    if (!tile) {
        return false;
    }

    const tileset = map.tilesets.find(
        (set) => set.id === tile.tilesetId
    );

    if (!tileset) {
        return false;
    }

    const name = tileset.name.toLowerCase();

    return (
        name.includes("tree") ||
        name.includes("bush") ||
        (
            name.includes("lantern") &&
            !name.includes("lantern_2")
        )
    );
}


// ======================================================
// KOLLISIONS-RECHTECK
// ======================================================

function getCollisionRect(tileX, tileY) {

    return {
        x: tileX * map.metadata.tileSize,
        y: tileY * map.metadata.tileSize,
        width: map.metadata.tileSize,
        height: map.metadata.tileSize
    };
}


// ======================================================
// RECHTECK-KOLLISION
// ======================================================

function rectanglesCollide(a, b) {

    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}


// ======================================================
// SPIELER-KOLLISION MIT MAP
// ======================================================

function playerCollidesWithMap(x, y) {

    const testPlayer = {
        x: x,
        y: y,
        width: player.width,
        height: player.height
    };

    const tileSize = map.metadata.tileSize;

    const startX =
        Math.floor(x / tileSize) - 1;

    const endX =
        Math.floor(
            (x + player.width) / tileSize
        ) + 1;

    const startY =
        Math.floor(y / tileSize) - 1;

    const endY =
        Math.floor(
            (y + player.height) / tileSize
        ) + 1;


    for (const layer of map.layers) {

        if (!layer.visible) {
            continue;
        }


        for (
            let tileY = Math.max(0, startY);
            tileY <= Math.min(
                map.metadata.height - 1,
                endY
            );
            tileY++
        ) {

            for (
                let tileX = Math.max(0, startX);
                tileX <= Math.min(
                    map.metadata.width - 1,
                    endX
                );
                tileX++
            ) {

                const tile =
                    layer.data[tileY]?.[tileX];

                if (!tile) {
                    continue;
                }


                if (!isCollidableTile(tile)) {
                    continue;
                }


                const collisionRect =
                    getCollisionRect(
                        tileX,
                        tileY
                    );


                if (
                    rectanglesCollide(
                        testPlayer,
                        collisionRect
                    )
                ) {
                    return true;
                }
            }
        }
    }

    return false;
}


// ======================================================
// SPIELER BEWEGEN
// ======================================================

function update(deltaTime) {

    const movement =
        player.speed * deltaTime;

    player.moving = false;

    let newX = player.x;
    let newY = player.y;


    // ==================================================
    // LINKS
    // ==================================================

    if (
        keys["KeyA"] ||
        keys["ArrowLeft"]
    ) {

        newX -= movement;

        player.direction = "left";
        player.moving = true;
    }


    // ==================================================
    // RECHTS
    // ==================================================

    if (
        keys["KeyD"] ||
        keys["ArrowRight"]
    ) {

        newX += movement;

        player.direction = "right";
        player.moving = true;
    }


    // ==================================================
    // KOLLISION X
    // ==================================================

    if (
        !playerCollidesWithMap(
            newX,
            player.y
        )
    ) {

        player.x = newX;
    }


    // ==================================================
    // HOCH
    // ==================================================

    if (
        keys["KeyW"] ||
        keys["ArrowUp"]
    ) {

        newY -= movement;

        player.direction = "up";
        player.moving = true;
    }


    // ==================================================
    // RUNTER
    // ==================================================

    if (
        keys["KeyS"] ||
        keys["ArrowDown"]
    ) {

        newY += movement;

        player.direction = "down";
        player.moving = true;
    }


    // ==================================================
    // KOLLISION Y
    // ==================================================

    if (
        !playerCollidesWithMap(
            player.x,
            newY
        )
    ) {

        player.y = newY;
    }


    // ==================================================
    // ANIMATION
    // ==================================================

    if (player.moving) {

        player.animationTimer += deltaTime;

        if (
            player.animationTimer >=
            player.animationSpeed
        ) {

            player.animationTimer = 0;

            player.animationFrame++;

            if (
                player.animationFrame >= 6
            ) {
                player.animationFrame = 0;
            }
        }

    } else {

        player.animationFrame = 0;
        player.animationTimer = 0;
    }


    // ==================================================
    // MAP-GRENZEN
    // ==================================================

    const worldWidth =
        map.metadata.width *
        map.metadata.tileSize;

    const worldHeight =
        map.metadata.height *
        map.metadata.tileSize;


    player.x = Math.max(
        0,
        Math.min(
            player.x,
            worldWidth - player.width
        )
    );


    player.y = Math.max(
        0,
        Math.min(
            player.y,
            worldHeight - player.height
        )
    );


    // ==================================================
    // KAMERA
    // ==================================================

    camera.x =
        player.x -
        canvas.width / (2 * zoom) +
        player.width / 2;

    camera.y =
        player.y -
        canvas.height / (2 * zoom) +
        player.height / 2;


    camera.x = Math.max(
        0,
        Math.min(
            camera.x,
            worldWidth - canvas.width / zoom
        )
    );

    camera.y = Math.max(
        0,
        Math.min(
            camera.y,
            worldHeight - canvas.height / zoom
        )
    );
}

// ======================================================
// MAP ZEICHNEN
// ======================================================

function drawMap() {

    for (const layer of map.layers) {

        if (!layer.visible) {
            continue;
        }


        for (
            let y = 0;
            y < layer.data.length;
            y++
        ) {

            for (
                let x = 0;
                x < layer.data[y].length;
                x++
            ) {

                const tile =
                    layer.data[y][x];

                if (tile === null) {
                    continue;
                }


                const image =
                    images.get(
                        tile.tilesetId
                    );

                if (!image) {
                    continue;
                }


                const tileset =
                    map.tilesets.find(
                        set =>
                            set.id ===
                            tile.tilesetId
                    );

                if (!tileset) {
                    continue;
                }


                const sourceX =
                    tile.tileX *
                    tileset.tileWidth;

                const sourceY =
                    tile.tileY *
                    tileset.tileHeight;


                const drawX =
                    (x * map.metadata.tileSize - camera.x) * zoom;

                const drawY =
                    (y * map.metadata.tileSize - camera.y) * zoom;


                ctx.drawImage(

                        image,
                        sourceX,
                        sourceY,
                        tileset.tileWidth,
                        tileset.tileHeight,
                        drawX,
                        drawY,
                        tileset.tileWidth * zoom,
                        tileset.tileHeight * zoom
                );
            }
        }
    }
}


// ======================================================
// VORDERGRUND OBJEKTE ZEICHNEN
// ======================================================

function drawForegroundObjects() {

    for (const layer of map.layers) {

        if (!layer.visible) {
            continue;
        }


        for (
            let y = 0;
            y < layer.data.length;
            y++
        ) {

            for (
                let x = 0;
                x < layer.data[y].length;
                x++
            ) {

                const tile =
                    layer.data[y][x];


                if (
                    !isForegroundTile(tile)
                ) {
                    continue;
                }


                const image =
                    images.get(
                        tile.tilesetId
                    );

                if (!image) {
                    continue;
                }


                const tileset =
                    map.tilesets.find(
                        set =>
                            set.id ===
                            tile.tilesetId
                    );

                if (!tileset) {
                    continue;
                }


                const worldX =
                    x *
                    map.metadata.tileSize;

                const worldY =
                    y *
                    map.metadata.tileSize;


                const objectBottom =
                    worldY +
                    tileset.tileHeight;

                const playerBottom =
                    player.y +
                    player.height;


                // Spieler steht vor dem Objekt
                // -> Objekt nicht nochmal zeichnen
                if (
                    playerBottom >=
                    objectBottom
                ) {
                    continue;
                }


                const sourceX =
                    tile.tileX *
                    tileset.tileWidth;

                const sourceY =
                    tile.tileY *
                    tileset.tileHeight;


                const drawX =
                    (worldX - camera.x) * zoom;

                const drawY =
                    (worldY - camera.y) * zoom;


                ctx.drawImage(

                    image,
                    sourceX,
                    sourceY,
                    tileset.tileWidth,
                    tileset.tileHeight,
                    drawX,
                    drawY,
                    tileset.tileWidth * zoom,
                    tileset.tileHeight * zoom
                );
            }
        }
    }
}


// ======================================================
// SPIELER ZEICHNEN
// ======================================================

function drawPlayer() {

    const image =
        playerImages[player.direction];


    if (!image) {
        return;
    }


    // Wir haben 6 Frames pro Sheet
    const frameCount = 6;

    const frameWidth =
        image.width / frameCount;

    const frameHeight =
        image.height;


    const sourceX =
        player.animationFrame *
        frameWidth;


    // Vergrößerung für Pixel-Art
    const scale = 1.5;

    const drawWidth =
        frameWidth * scale;

    const drawHeight =
        frameHeight * scale;


    // Füße bleiben auf der Kollisionsbox
    const drawX =
        (player.x - camera.x) * zoom +
        (player.width * zoom) / 2 -
        (drawWidth * zoom) / 2;

    const drawY =
        (player.y - camera.y) * zoom +
        player.height * zoom -
        drawHeight * zoom;


    ctx.drawImage(

        image,
        sourceX,
        0,
        frameWidth,
        frameHeight,
        drawX,
        drawY,
        drawWidth * zoom,
        drawHeight * zoom
    );
}


// ======================================================
// GAME LOOP
// ======================================================

let lastTime = 0;


function gameLoop(currentTime) {

    const deltaTime =
        Math.min(
            (currentTime - lastTime) / 1000,
            0.05
        );

    lastTime = currentTime;


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    update(deltaTime);

    drawMap();

    drawPlayer();

    drawForegroundObjects();


    requestAnimationFrame(
        gameLoop
    );
}


// ======================================================
// START
// ======================================================

loadMap().catch(error => {

    console.error(error);

    ctx.fillStyle = "red";
    ctx.font = "20px Arial";

    ctx.fillText(
        "Fehler beim Laden. F12 -> Konsole prüfen.",
        20,
        40
    );
});