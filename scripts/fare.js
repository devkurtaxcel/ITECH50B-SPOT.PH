document.addEventListener('DOMContentLoaded', function() {
  const fareForm = document.getElementById('fare-form');
  const fareOutput = document.getElementById('fare-output');

  if (!fareForm || !fareOutput) return;

  const distanceData = {
    trece: { trece: 0, alfonso: 25, dasma: 35, indang: 10, olivarez: 40 },
    alfonso: { trece: 25, alfonso: 0, dasma: 30, indang: 18, olivarez: 22 },
    dasma: { trece: 35, alfonso: 30, dasma: 0, indang: 18, olivarez: 45 },
    indang: { trece: 10, alfonso: 18, dasma: 18, indang: 0, olivarez: 30 },
    olivarez: { trece: 40, alfonso: 22, dasma: 45, indang: 30 }
  };

  const fareCalculator = {
    calculateProvincialAircon: (distance, passengerType) => {
      const baseRate = 2.10;
      let fare = baseRate * distance;
      if (passengerType !== 'regular') fare = fare * 0.8;
      return Math.round(fare * 4) / 4;
    },
    calculateTraditionalJeepney: (distance, passengerType) => {
      const isDiscount = passengerType !== 'regular';
      let fare;
      if (distance <= 4) {
        fare = isDiscount ? 10.40 : 13.00;
      } else {
        const baseFare = isDiscount ? 10.40 : 13.00;
        const ratePerKm = isDiscount ? 1.44 : 1.80;
        fare = baseFare + (ratePerKm * (distance - 4));
      }
      return Math.round(fare * 4) / 4;
    }
  };

  function calculateTricycle(distance) {
    const ratePerKm = 12.0;
    return Math.round((ratePerKm * distance) * 4) / 4;
  }

  fareForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const startLocation = document.getElementById('start-location').value;
    const destination = document.getElementById('destination').value;
    const vehicleType = document.getElementById('vehicle-type') ? document.getElementById('vehicle-type').value : 'jeepney';
    const passengerType = document.getElementById('passenger-type') ? document.getElementById('passenger-type').value : 'regular';

    if (!startLocation || !destination) {
      fareOutput.innerHTML = '<p class="fare-result">Please select both start location and destination</p>';
      return;
    }

    const distance = distanceData[startLocation] && distanceData[startLocation][destination];
    if (distance === undefined) {
      fareOutput.innerHTML = '<p class="fare-result">Route not available. Please select different locations.</p>';
      return;
    }

    let computedFare;
    if (vehicleType === 'bus') {
      if (startLocation !== destination && (distance < 5 || distance > 600)) {
        fareOutput.innerHTML = '<p class="fare-result">Distance out of range for Provincial Aircon Bus</p>';
        return;
      }
      computedFare = fareCalculator.calculateProvincialAircon(distance, passengerType);
    } else if (vehicleType === 'jeepney') {
      if (startLocation !== destination && (distance < 1 || distance > 50)) {
        fareOutput.innerHTML = '<p class="fare-result">Distance out of range for Traditional Jeepney</p>';
        return;
      }
      computedFare = fareCalculator.calculateTraditionalJeepney(distance, passengerType);
    } else if (vehicleType === 'tricycle') {
      computedFare = calculateTricycle(distance);
    }

    const MIN_FARE = 15.00;
    if (typeof computedFare === 'number' && computedFare < MIN_FARE) computedFare = MIN_FARE;
    if (computedFare !== undefined) {
      computedFare = Math.round(computedFare);
      fareOutput.innerHTML = `<p class="fare-result highlight">Estimated Fare: &#8369;${computedFare}</p>`;
    } else {
      fareOutput.innerHTML = '<p class="fare-result">Unable to compute fare for selected options.</p>';
    }
  });
});
