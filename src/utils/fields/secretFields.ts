const secretFields = [
  {
    text: 'The SBU unexpectedly visited all players. Everyone loses 700mm, except for him/her – he/she managed to hack the phone in time.',
    amounts: [-700],
    numOfPlayersInvolved: 'all',
  },
  {
    text: '$RANDOM_PLAYER$ reported him/her to NABU for undeclared property that he/she did not list in financial documents. Pays a fine of 1500mm. The reporter receives a reward of 3500mm.',
    amounts: [-1500, 3500],
    numOfPlayersInvolved: 'two',
  },
  // {
  //   text: 'He/She initiated road repairs, and all residents are grateful. Receives 300mm from each player as a "road tax".',
  //   amounts: [null, -300],
  //   numOfPlayersInvolved: 'all',
  // },
  // {
  //   text: 'Parliament passed a law on an air tax. He/She must pay 500mm.',
  //   amounts: [-500],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'Yanukovych decided to return, and he/she must contribute 1000mm to his "golden loaf".',
  //   amounts: [-1000],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'The EU decided to provide financial support to Ukraine. He/She receives 2000mm because his/her documents were the first to reach Brussels.',
  //   amounts: [2000],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'The hryvnia unexpectedly strengthened, and he/she profited from currency exchange. Receives 1500mm.',
  //   amounts: [1500],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She sold a piglet for a record price. Receives 2000mm.',
  //   amounts: [2000],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She performed the song "Bears-Balalaikas" in karaoke and receives 500mm.',
  //   amounts: [500],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She performed the song "Vanka-Vstanka" in karaoke and receives 500mm.',
  //   amounts: [500],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She performed the song "I Dance the Hopak, Hop-Hop Hopak" in karaoke and receives 500mm.',
  //   amounts: [500],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She performed the song "Spider" in karaoke and receives 1250mm.',
  //   amounts: [1250],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She performed the song "How Can I Not Love You, My Kyiv!" in karaoke and receives 4000mm.',
  //   amounts: [4000],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She found a huge number of porcini mushrooms. Receives 800mm for selling them.',
  //   amounts: [800],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'He/She won a gold medal. Receives 1500mm from the government for the achievement.',
  //   amounts: [1500],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'Kolomoisky asked him/her to "deliver a package". Pays 500mm because refusing is scary.',
  //   amounts: [-500],
  //   numOfPlayersInvolved: 'one',
  // },
  // {
  //   text: 'The government decided to raise tariffs on water, gas, and electricity. He/She must pay 800mm for the new utility costs.',
  //   amounts: [-800],
  //   numOfPlayersInvolved: 'one',
  // },
];

export type SecretType = (typeof secretFields)[0];
export default secretFields;
