const frStrings = {
  every: 'chaque',
  until: "jusqu'à",
  day: 'jour',
  days: 'jours',
  week: 'semaine',
  weeks: 'semaines',
  on: 'sur',
  in: 'dans',
  'on the': 'sur le',
  for: 'pour',
  and: 'et',
  or: 'ou',
  at: 'à',
  last: 'dernier',
  '(~ approximate)': '(~ approximatif)',
  times: 'fois',
  time: 'temps',
  minutes: 'minutes',
  hours: 'heures',
  weekdays: 'jours de la semaine',
  weekday: 'jour de la semaine',
  months: 'mois',
  month: 'mois',
  years: 'ans',
  year: 'an',
};

export default {
  getText: (id) => frStrings[id] || id,
  language: {
    dayNames: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    monthNames: [
      'Janvier',
      'Février',
      'Mars',
      'Avril',
      'Mai',
      'Juin',
      'Juillet',
      'Août',
      'Septembre',
      'Octobre',
      'Novembre',
      'Décembre',
    ],
  },
};
