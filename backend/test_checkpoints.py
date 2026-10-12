
from routing.services import generate_checkpoints

# Simple route with two coordinates approximately 20 miles apart.
coordinates = [
    [-97.7431, 30.2672],
    [-97.5000, 30.2672],
]

for interval in (10, 25, 50):
    print(f"\nInterval: {interval} miles")

    checkpoints = generate_checkpoints(coordinates, interval)

    for checkpoint in checkpoints:
        print(checkpoint)
